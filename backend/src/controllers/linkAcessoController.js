import { z } from 'zod';
import { linkAcessoService } from '../services/linkAcessoService.js';
import { identificador, senha } from './equipeController.js';

/**
 * Link de acesso (ver `linkAcessoService`). Gerar é da administração, na
 * Equipe; conferir e usar são públicos, porque quem abre o link ainda não
 * tem senha para entrar. O que protege as duas rotas públicas é o próprio
 * link: assinado, de uma conta só, de uso único e com prazo.
 */

const token = z.string().min(1, 'Link incompleto.').max(1000, 'Link inválido.');

export const conferirLinkSchema = z.object({ token });

/** Mesmas regras de login e senha da Equipe. */
export const usarLinkSchema = z.object({ token, email: identificador, senha });

export const linkAcessoController = {
  async gerar(req, res) {
    res.status(201).json(await linkAcessoService.gerar(req.params.id, req.usuario));
  },
  async conferir(req, res) {
    res.json(await linkAcessoService.conferir(req.body.token));
  },
  async usar(req, res) {
    res.json(await linkAcessoService.usar(req.body.token, req.body));
  },
};
