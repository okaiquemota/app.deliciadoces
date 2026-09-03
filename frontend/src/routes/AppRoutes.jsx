import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RotaProtegida } from './RotaProtegida.jsx';
import { Layout } from '../components/Layout.jsx';
import { Login } from '../pages/Login.jsx';
import { Dashboard } from '../pages/Dashboard.jsx';
import { Estoque } from '../pages/Estoque.jsx';
import { Caixa } from '../pages/Caixa.jsx';
import { NaoEncontrada } from '../pages/NaoEncontrada.jsx';

/**
 * Mapa de rotas da aplicação.
 *
 * As telas dos módulos ainda são esqueletos: a estrutura de navegação foi
 * montada primeiro para que cada integrante do grupo possa desenvolver
 * seu módulo em paralelo, sem conflito de arquivos.
 */
export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<RotaProtegida />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/caixa" element={<Caixa />} />
          </Route>
        </Route>

        <Route path="*" element={<NaoEncontrada />} />
      </Routes>
    </BrowserRouter>
  );
}
