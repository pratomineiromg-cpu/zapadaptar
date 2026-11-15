import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '../App';
import '../index.css';

createRoot(document.getElementById('root')!).render(<BrowserRouter>
  <aside className="bg-emerald-950 px-4 py-2 text-center text-sm text-white">
    Ambiente de demonstração · Dados fictícios · Navegação pelos módulos
  </aside>
  <App tenantId="mostruario" user={{id:'visitante',name:'Visitante',role:'gerente',email:'visitante@example.test',active:true}}/>
</BrowserRouter>);
