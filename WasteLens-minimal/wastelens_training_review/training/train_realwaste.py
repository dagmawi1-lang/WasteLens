#!/usr/bin/env python3
"""Train a nine-material WasteLens classifier on the UCI RealWaste ImageFolder."""
import argparse, hashlib, json, random, time
from collections import Counter
from pathlib import Path
import numpy as np
from PIL import Image, ImageFile
import torch
from torch import nn
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, transforms, models
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix

ImageFile.LOAD_TRUNCATED_IMAGES = False
CLASSES = ['Cardboard','Food Organics','Glass','Metal','Miscellaneous Trash','Paper','Plastic','Textile Trash','Vegetation']
EXTS = {'.jpg','.jpeg','.png','.webp'}

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def split_indices(targets, seed):
    indices=np.arange(len(targets)); train, temp=train_test_split(indices,test_size=.30,random_state=seed,stratify=targets)
    val, test=train_test_split(temp,test_size=.50,random_state=seed,stratify=np.array(targets)[temp])
    return train.tolist(),val.tolist(),test.tolist()

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--data-dir',default='data/realwaste/realwaste-main/RealWaste')
    p.add_argument('--epochs',type=int,default=12); p.add_argument('--batch-size',type=int,default=32)
    p.add_argument('--image-size',type=int,default=224); p.add_argument('--seed',type=int,default=42)
    p.add_argument('--workers',type=int,default=2); p.add_argument('--patience',type=int,default=4)
    p.add_argument('--pretrained',action='store_true',help='Use ImageNet weights; requires a one-time download.')
    p.add_argument('--output',default='training_output'); args=p.parse_args()
    if args.epochs<1 or args.batch_size<1 or args.image_size<96 or args.patience<1: p.error('epochs, batch size, patience must be positive; image size must be >=96')
    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed)
    root=Path(args.data_dir)
    if not root.exists(): raise SystemExit(f'Dataset folder not found: {root}. Run python training/prepare_realwaste.py first.')
    base=datasets.ImageFolder(root)
    if base.classes != CLASSES: raise SystemExit(f'Expected class folders {CLASSES}; found {base.classes}. Check --data-dir.')
    # Drop byte-identical duplicate files before splitting to avoid exact-image leakage.
    seen={}; kept=[]; dupes=[]
    for idx,(path,label) in enumerate(base.samples):
        try:
            with Image.open(path) as im:
                im.verify()
            digest=sha(path)
        except Exception as e:
            print(f'SKIP invalid image: {path}: {e}'); continue
        if digest in seen: dupes.append({'path':path,'duplicateOf':seen[digest]}); continue
        seen[digest]=path; kept.append((path,label))
    if len(kept)<90: raise SystemExit('Too few valid unique images to create reliable stratified splits.')
    targets=[label for _,label in kept]
    train_idx,val_idx,test_idx=split_indices(targets,args.seed)
    split_manifest={'seed':args.seed,'strategy':'stratified random image split after exact SHA-256 duplicate removal','warning':'Exact duplicates are removed, but distinct photos of the same physical object may still cross splits because the source dataset has no object/session IDs.','classes':CLASSES,'counts':{}}
    for name,ids in [('train',train_idx),('validation',val_idx),('test',test_idx)]:
        split_manifest['counts'][name]=dict(Counter(CLASSES[targets[i]] for i in ids))
    split_manifest['duplicateFilesRemoved']=len(dupes); split_manifest['totalUniqueImages']=len(kept)
    out=Path(args.output); out.mkdir(parents=True,exist_ok=True)
    (out/'split_manifest.json').write_text(json.dumps(split_manifest,indent=2))
    train_tf=transforms.Compose([transforms.Resize((args.image_size,args.image_size)),transforms.RandomHorizontalFlip(),transforms.RandomRotation(12),transforms.ColorJitter(brightness=.15,contrast=.15,saturation=.12),transforms.ToTensor(),transforms.Normalize([.485,.456,.406],[.229,.224,.225])])
    eval_tf=transforms.Compose([transforms.Resize((args.image_size,args.image_size)),transforms.ToTensor(),transforms.Normalize([.485,.456,.406],[.229,.224,.225])])
    class Dataset(torch.utils.data.Dataset):
        def __init__(self, ids, tfm): self.ids=ids; self.tfm=tfm
        def __len__(self): return len(self.ids)
        def __getitem__(self,i):
            path,label=kept[self.ids[i]]
            with Image.open(path) as im: return self.tfm(im.convert('RGB')),label
    device=torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    train_loader=DataLoader(Dataset(train_idx,train_tf),batch_size=args.batch_size,shuffle=True,num_workers=args.workers)
    val_loader=DataLoader(Dataset(val_idx,eval_tf),batch_size=args.batch_size,shuffle=False,num_workers=args.workers)
    test_loader=DataLoader(Dataset(test_idx,eval_tf),batch_size=args.batch_size,shuffle=False,num_workers=args.workers)
    weights=models.ResNet18_Weights.DEFAULT if args.pretrained else None
    model=models.resnet18(weights=weights); model.fc=nn.Linear(model.fc.in_features,len(CLASSES)); model.to(device)
    train_counts=Counter(targets[i] for i in train_idx); class_weights=torch.tensor([len(train_idx)/(len(CLASSES)*train_counts[i]) for i in range(len(CLASSES))],dtype=torch.float32,device=device)
    criterion=nn.CrossEntropyLoss(weight=class_weights); optimizer=torch.optim.AdamW(model.parameters(),lr=3e-4,weight_decay=1e-4)
    best=float('inf'); stale=0; history=[]; started=time.time()
    for epoch in range(args.epochs):
        model.train(); total=correct=loss_sum=0
        for x,y in train_loader:
            x,y=x.to(device),y.to(device); optimizer.zero_grad(); logits=model(x); loss=criterion(logits,y); loss.backward(); optimizer.step()
            loss_sum+=loss.item()*len(y); correct+=(logits.argmax(1)==y).sum().item(); total+=len(y)
        model.eval(); vloss=vcorrect=vtotal=0
        with torch.no_grad():
            for x,y in val_loader:
                x,y=x.to(device),y.to(device); logits=model(x); loss=criterion(logits,y); vloss+=loss.item()*len(y); vcorrect+=(logits.argmax(1)==y).sum().item(); vtotal+=len(y)
        row={'epoch':epoch+1,'trainLoss':loss_sum/total,'trainAccuracy':correct/total,'validationLoss':vloss/vtotal,'validationAccuracy':vcorrect/vtotal}; history.append(row); print(json.dumps(row),flush=True)
        if row['validationLoss']<best:
            best=row['validationLoss']; stale=0; torch.save({'state_dict':model.state_dict(),'classes':CLASSES,'imageSize':args.image_size,'normalization':{'mean':[.485,.456,.406],'std':[.229,.224,.225]}},out/'wastelens_realwaste_resnet18.pth')
        else:
            stale+=1
            if stale>=args.patience: print('Early stopping.'); break
    checkpoint=torch.load(out/'wastelens_realwaste_resnet18.pth',map_location=device,weights_only=True); model.load_state_dict(checkpoint['state_dict']); model.eval()
    truth=[]; pred=[]
    with torch.no_grad():
        for x,y in test_loader:
            logits=model(x.to(device)); pred.extend(logits.argmax(1).cpu().tolist()); truth.extend(y.tolist())
    report=classification_report(truth,pred,labels=list(range(len(CLASSES))),target_names=CLASSES,output_dict=True,zero_division=0)
    matrix=confusion_matrix(truth,pred,labels=list(range(len(CLASSES))))
    result={'modelName':'WasteLens RealWaste ResNet18 material classifier','dataset':'UCI RealWaste','datasetCitation':'Single, S., Iranmanesh, S., & Raad, R. (2023). RealWaste. UCI Machine Learning Repository. https://doi.org/10.24432/C5SS4G','generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'device':str(device),'classes':CLASSES,'metrics':{'testSamples':len(truth),'accuracy':report['accuracy'],'macroPrecision':report['macro avg']['precision'],'macroRecall':report['macro avg']['recall'],'macroF1':report['macro avg']['f1-score'],'perClass':{c:report[c] for c in CLASSES},'confusionMatrix':matrix.tolist()},'split':split_manifest,'training':{'epochsCompleted':len(history),'bestValidationLoss':best,'durationSeconds':round(time.time()-started,1),'pretrainedImageNet':bool(args.pretrained)},'limitations':['Material recognition is not a local disposal decision.','Exact duplicate images were removed, but same-object photo leakage cannot be ruled out without object/session IDs.','Test metrics apply only to this dataset split and do not establish real-world municipal sorting performance.']}
    (out/'evaluation.json').write_text(json.dumps(result,indent=2)); (out/'training_history.json').write_text(json.dumps(history,indent=2))
    print('\nHELD-OUT TEST RESULTS'); print(classification_report(truth,pred,target_names=CLASSES,zero_division=0)); print(f"Saved model and reports in {out.resolve()}")

if __name__=='__main__': main()
