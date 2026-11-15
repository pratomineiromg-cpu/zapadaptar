import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const projectId = process.env.GCLOUD_PROJECT;
if (projectId !== 'demo-zapadaptar' || ![process.env.FIRESTORE_EMULATOR_HOST,process.env.FIREBASE_AUTH_EMULATOR_HOST]
  .every(address=>/^127\.0\.0\.1:\d+$/.test(address || ''))) throw Error('Use exclusivamente os emuladores locais demo-zapadaptar.');
initializeApp({projectId});
const db=getFirestore(),auth=getAuth(),tenantId='prato-mineiro',tenant=db.collection('tenants').doc(tenantId);
const email='gerente@prato-mineiro.test',password=randomUUID();
let account;
try { account=await auth.getUserByEmail(email); await auth.updateUser(account.uid,{password}); }
catch(e){if(e.code!=='auth/user-not-found')throw e; account=await auth.createUser({email,password,displayName:'Gerente de teste'});}
await auth.setCustomUserClaims(account.uid,{tenantId,role:'gerente'});
await tenant.collection('productsDigitalMenu').doc('marmita').set({id:'marmita',name:'Frango com quiabo',description:'Marmita pequena',
  image:'',category:'Almoço',price:24,tamanhos:[{label:'P',price:24}],adicionais:[],naoMandar:[],utensilios:[]});
await tenant.collection('cardapios').doc('almoco').set({id:'almoco',name:'Almoço Prato Mineiro',description:'Cardápio de teste',
  active:true,productIds:['marmita'],imageBanner:'',availableHours:'Almoço',createdAt:new Date().toISOString()});
await tenant.collection('settings').doc('default').set({operation:{isOpen:true,acceptPublicOrders:true},delivery:{defaultFee:5}},{merge:true});
await db.collection('publicMenuLinks').doc('almoco').set({tenantId});
console.log('Acesso exclusivo do emulador:',email,password);
await db.terminate();
