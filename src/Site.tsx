import { Routes, Route, useLocation } from 'react-router-dom';
import SessionGate from './components/SessionGate';
import PublicCardapioView from './components/PublicCardapioView';
import PublicTracking from './components/PublicTracking';

export default function Site() {
  const { pathname } = useLocation();
  return <Routes>
    <Route path="/cardapio/:menuId" element={<PublicCardapioView key={pathname} />} />
    <Route path="/cardapio/:tenantId/:menuId" element={<PublicCardapioView key={pathname} />} />
    <Route path="/rastreamento-pedido/:id?" element={<PublicTracking key={pathname} />} />
    <Route path="*" element={<SessionGate />} />
  </Routes>;
}
