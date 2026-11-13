import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import app from './firebase';

const functions = getFunctions(app);
if (import.meta.env.VITE_USE_EMULATORS === 'true') connectFunctionsEmulator(functions, '127.0.0.1', 5001);
export async function call<T = void>(name: string, data: object): Promise<T> {
  return (await httpsCallable<object, T>(functions, name)(JSON.parse(JSON.stringify(data)))).data;
}
export function operate(action: string, payload: object, requestId: string = crypto.randomUUID()) {
  return call<void>('operate', { action, payload, requestId });
}
