-- Mantém o banco do Supabase acordado (ver docs/DEPLOY.md, "Banco pausado").
--
-- O Supabase pausa o projeto gratuito que passa uma semana com pouca
-- consulta. Este job do pg_cron, de dentro do próprio banco, chama o
-- /api/health do sistema a cada 6 horas pela internet (pg_net). A chamada
-- faz o caminho de uma usuária de verdade: Vercel → pooler → leitura da
-- tabela `usuarios`, e é isso que conta como uso.
--
-- Só age onde existem pg_cron e pg_net, ou seja, no Supabase. No Postgres
-- local (desenvolvimento e testes) a migration passa sem fazer nada.
--
-- Pode rodar de novo sem problema: `cron.schedule` com o mesmo nome
-- atualiza o job em vez de criar outro.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    GRANT USAGE ON SCHEMA cron TO postgres;

    -- 03:47, 09:47, 15:47 e 21:47 UTC: no meio dos horários do workflow do
    -- GitHub (que roda às :23 de 0, 6, 12 e 18h), para espalhar as chamadas.
    PERFORM cron.schedule(
      'manter-banco-ativo',
      '47 3,9,15,21 * * *',
      $job$
        SELECT net.http_get(
          url := 'https://app-deliciadoces.vercel.app/api/health',
          timeout_milliseconds := 60000
        );
      $job$
    );
  END IF;
END
$$;
