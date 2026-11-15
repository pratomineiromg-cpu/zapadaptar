import * as demo from '../utils/mockData';

const collections:Record<string,{id:string}[]> = {
  clients:demo.INITIAL_CLIENTS,orders:demo.INITIAL_ORDERS,history:demo.INITIAL_HISTORY,
  messages:Object.entries(demo.INITIAL_MESSAGES).map(([id,items])=>({id,items})),
  automations:demo.INITIAL_AUTOMATIONS,productsDigitalMenu:demo.INITIAL_PRODUCTS_DIGITAL_MENU,
  cardapios:demo.INITIAL_CARDAPIOS,deliveryOrders:demo.INITIAL_DELIVERY_ORDERS,
  couriers:demo.INITIAL_COURIERS,routes:demo.INITIAL_ROUTES,reviews:demo.INITIAL_COURIER_REVIEWS,
  deliveryHistories:demo.INITIAL_DELIVERY_HISTORIES
};
export const db = {}, auth = {};
export function collection(_:unknown, ...parts:string[]) {return parts.join('/');}
export const doc = collection;
export function onSnapshot(path:string,notify:(value:unknown)=>void) {
  const docs=(collections[path.split('/').pop()!] || []).map(row=>({id:row.id,data:()=>row}));
  notify(path.endsWith('/settings/default') ? {exists:()=>true,data:()=>demo.DEFAULT_SETTINGS}
    : {docs,forEach:docs.forEach.bind(docs),empty:!docs.length,size:docs.length});
  return ()=>{};
}
async function unavailable() {throw Error('Operação disponível no painel autenticado do restaurante.');}
export const operate=unavailable, call=unavailable, setDoc=unavailable, deleteDoc=unavailable, getDocFromServer=unavailable;
export function writeBatch(){return {set:()=>{},delete:()=>{},commit:unavailable};}
export async function signOut(){window.location.assign('/');}
