# WRB-TV iPhone (Cloudflare Worker + PWA)

Este repositório contém um projeto independente para disponibilizar a WRB-TV no iPhone como Progressive Web App (PWA). O app é instalado pelo Safari em **Compartilhar → Adicionar à Tela de Início**. Não é um IPA nativo e não exige publicação na App Store.

## Arquitetura isolada

- Worker exclusivo: `wrbtv-iphone-pwa-20261016-3858215c`.
- Interface e arquivos estáticos servidos somente de `public/`.
- A API e o proxy de mídia são executados diretamente pelo Worker deste projeto usando `netlify/functions/api.mjs`. Os códigos 0022/PFAST usam os pools e as tentativas de User-Agent do aplicativo Android, sem encaminhar o login para outro Worker.
- O proxy HLS acompanha redirecionamentos manualmente e normaliza URLs de streams com IPv4 público usando `sslip.io`, conforme o servidor local do Android.
- O deploy não usa nem altera outros Workers, Pages, domínios ou repositórios.
- O workflow de deploy é manual (`workflow_dispatch`) para evitar implantação acidental antes da configuração das credenciais.

## Publicação na Cloudflare

1. No GitHub, abra **Settings → Secrets and variables → Actions** deste repositório.
2. Cadastre os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` para uma conta Cloudflare onde você tenha permissão para criar Workers.
3. O token precisa permitir consultar Workers e criar/implantar Workers. O workflow verifica as credenciais e consulta o nome reservado antes do deploy; se encontrar um Worker com esse nome ou não conseguir confirmar sua inexistência, ele aborta para evitar substituir qualquer projeto.
4. Abra **Actions → Deploy WRB-TV iPhone to Cloudflare Workers → Run workflow**. O workflow confirma por API que o nome do Worker não existe antes de publicar e aborta se já existir ou se não conseguir verificar.
5. Após a execução bem-sucedida, o Wrangler informará a URL `workers.dev` do Worker independente. Abra essa URL no Safari do iPhone e escolha **Compartilhar → Adicionar à Tela de Início**.

**Segurança:** não coloque tokens no código, no README, nos issues ou nesta conversa. Use somente os secrets do GitHub. O workflow é manual e não roda deploy até ser iniciado após o cadastro dos secrets.

## Verificações

O workflow de validação automática checa a sintaxe da API e do service worker, o manifesto e os metadados de instalação. O workflow de deploy realiza validações adicionais antes de executar o Wrangler.

## Limitações do iOS

- Trata-se de uma PWA, não de um aplicativo iOS nativo.
- O iOS pode exigir toque do usuário antes de iniciar áudio ou vídeo.
- A reprodução depende do suporte do Safari/iOS aos formatos dos fluxos.
- A sessão é armazenada no `localStorage` dessa origem HTTPS; mudar de domínio pode exigir novo login.

## Estrutura de hospedagem

- `public/`: somente os arquivos públicos da PWA.
- `src/index.js`: executa a API do próprio projeto e serve os assets; não encaminha login ou reprodução a outro Worker.
- `wrangler.jsonc`: define nome exclusivo e diretório público.
- `.github/workflows/deploy-cloudflare.yml`: publicação manual isolada.
- `netlify/functions/api.mjs`: lógica de API reutilizada, mantida como código-fonte do projeto.
