# Roteando o Discord por um proxy VPN self-hosted (Portainer + Gluetun + ProtonVPN + Vencord)

O discord teve as suas transmissões de tela e compartilhamento de webcams banidos
por causa da medida cautelar da [ANPD (Autoridade Nacional de Proteção de Dados)](https://www.gov.br/anpd/pt-br).
Como eu preciso do dessas ferramentas para trabalhos e laser, resolvi criar
uma maneira de burlar isso, sem o uso de VPS(no meu computador inteiro).
testei varias abordagens (cloudflared não serve pra isso, proxies públicos são furada),
cheguei numa combinação que funciona de verdade: **Portainer + Gluetun +
ProtonVPN (plano grátis) + um plugin próprio pro Vencord**.

Esse repositório documenta o processo do zero, incluindo os erros que eu
tomei no caminho, porque na hora de debugar isso foi o que mais me ajudou.

## O que essa stack faz

- Sobe um container `gluetun` no meu servidor doméstico (gerenciado pelo
  Portainer) que conecta num servidor da ProtonVPN e expõe um proxy SOCKS5
  na minha rede local.
- Um plugin de Vencord (`ProxySettings`) aponta **só o tráfego de rede do
  Discord** pra esse proxy, nada mais no meu PC ou na minha rede é afetado.
- Resultado: o Discord passa a enxergar a internet a partir do IP do
  servidor VPN, sem eu precisar de VPN paga ou ficar sofrendo por causa do ping alto e baixa velocidade no computador inteiro.

## O que essa stack **não** resolve

Documentando aqui pra quem for usar isso não ter surpresa:

- **Chamada de voz pode não seguir o proxy.** O Discord usa WebRTC pra
  áudio/vídeo, e é um comportamento conhecido do Chromium (base do Electron)
  esse tráfego às vezes ignorar o proxy configurado no app. Ou seja: API,
  gateway e conteúdo carregado pelo IP do proxy, mas a chamada de voz pode
  continuar medindo latência real e escolhendo servidor pela minha
  localização de verdade.
- **Plano grátis da ProtonVPN = países fixos e sem escolha manual de
  servidor.** Não dá pra escolher endpoint específico, só o país (via
  `SERVER_COUNTRIES`), e só entre os países liberados no plano grátis:
  Canadá, EUA, México, Holanda, Noruega, Polônia, Romênia, Cingapura, Suíça
  e Japão.
- **Um dispositivo por vez.** O plano grátis da Proton só aceita uma
  conexão simultânea, se tiver o app oficial logado em outro lugar, o
  túnel vai falhar a autenticação.

## Pré-requisitos

- Um servidor/computador ligado 24/7 na sua rede (no meu caso, uso um servidor
  pra outros containers).
- [Docker](https://get.docker.com) instalado nele.
- [Portainer CE](https://docs.portainer.io) rodando nesse Docker.
- Conta grátis na [ProtonVPN](https://protonvpn.com).
- Uma build de desenvolvimento do [Vencord](https://github.com/Vendicated/Vencord).

## Passo 1 — Instalar o Portainer (se ainda não tiver)

Acesse [https://docs.portainer.io/start/install-ce/server/docker/linux](https://docs.portainer.io/start/install-ce/server/docker/linux) para instalar o mesmo.

## Passo 2 — Pegar as credenciais da ProtonVPN

**Importante:** não use o e-mail/senha normal da sua conta. A Proton gera
credenciais separadas específicas pra apps de terceiros (o gluetun é um
deles).

1. Acesse [account.proton.me/u/0/vpn/OpenVpnIKEv2](https://account.proton.me/u/0/vpn/OpenVpnIKEv2).
2. Vá em Proton VPN → OpenVPN → Credentials
3. Copie o **OpenVPN username** e a **OpenVPN password** mostrados ali.
4. Se em algum momento a autenticação começar a falhar sem motivo aparente,
   volte nessa página e clique em **Reset credentials** pra gerar um novo login.

## Passo 3 — Criar o stack no Portainer

No Portainer: **Stacks → Add stack**, nome `protonvpn-proxy`, e cole isto no
**Web editor**:

```yaml
services:
  gluetun-proton:
    image: qmcgaw/gluetun:latest
    container_name: gluetun-proton
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    ports:
      - "1080:1080"
    environment:
      - VPN_SERVICE_PROVIDER=protonvpn
      - VPN_TYPE=openvpn
      - OPENVPN_USER=SEU_USUARIO_AQUI
      - OPENVPN_PASSWORD=SUA_SENHA_AQUI
      - SERVER_COUNTRIES=Netherlands
      - FREE_ONLY=on
      - SOCKS5_ENABLED=on
      - SOCKS5_USER=
      - SOCKS5_PASSWORD=
    volumes:
      - gluetun_proton_data:/gluetun
    restart: unless-stopped

volumes:
  gluetun_proton_data:
```

Troque `OPENVPN_USER` e `OPENVPN_PASSWORD` pelas credenciais do Passo 2, e
clique em **Deploy the stack**.

### As duas variáveis que mais me deram dor de cabeça

- **`FREE_ONLY=on`**
  sem essa variável, o gluetun pode escolher qualquer
  servidor do país escolhido, incluindo servidores **pagos**. Como minha
  conta é grátis, a Proton recusa a autenticação nesses servidores, e o
  erro que aparece (`AUTH_FAILED`) não deixa isso óbvio.
- **`SOCKS5_USER` / `SOCKS5_PASSWORD` vazios**
  o gluetun tem um proxy SOCKS5 embutido que pode pedir usuário/senha,
  mas o Chromium (motor por trás do Discord/Electron) **não suporta autenticação em proxy SOCKS5**.
  Se deixar preenchido, o Discord nunca vai conseguir conectar no proxy
  precisa deixar sem autenticação e confiar só no isolamento da rede local
  pra segurança.

## Passo 4 — Testar o proxy antes de mexer no Discord

De qualquer máquina na mesma rede:

```bash
curl -x socks5h://IP-DO-SERVIDOR:1080 https://ifconfig.me
```

Se retornar um IP (e não erro/timeout), o proxy está funcionando. Pra
confirmar o país:

```bash
curl -x socks5h://IP-DO-SERVIDOR:1080 https://ipinfo.io
```

## Passo 5 — Instalar o plugin ProxySettings no Vencord

Não existe um plugin oficial pra isso na lista padrão do Vencord, então
precisa de uma build de dev com o plugin adicionado manualmente.

```bash
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm install
```

Copie a pasta [`vencord-plugin/ProxySettings`](./vencord-plugin/ProxySettings)
deste repositório pra dentro de `src/userplugins/` do seu clone do Vencord,
ficando assim:

```
Vencord/src/userplugins/ProxySettings/index.ts
Vencord/src/userplugins/ProxySettings/native.ts
```

Builda e injeta:

```bash
pnpm build
pnpm inject
```
Selecione a versão do seu discord.

Reinicie o Discord por completo (caso não tenha reiniciado sozinho).

## Passo 6 — Configurar o plugin

No Discord: **Configurações → Vencord → Plugins → ProxySettings** (ícone de
engrenagem):

| Campo | Valor |
|---|---|
| Protocol | `socks5` |
| Host | IP local do servidor (ex: `192.168.1.67`) |
| Port | `1080` |
| Username / Password | deixar em branco |

Ative o toggle **Enabled** e reinicie o Discord.

## Troubleshooting

**`AUTH_FAILED` no log do gluetun**
1. Confirme que está usando as credenciais de app terceiro (Passo 2), não
   login normal.
2. Confirme que não tem outro dispositivo logado na Proton no momento
   (plano grátis = 1 conexão só).
3. Confirme `FREE_ONLY=on` no stack.
4. Se nada resolver, gere credenciais novas (**Reset credentials**) e
   espere uns minutos antes de tentar de novo, a Proton segura tentativas
   repetidas por um tempo.

**Discord não conecta / trava carregando com o plugin ativado**
- Confirme que `SOCKS5_USER` e `SOCKS5_PASSWORD` estão vazios no stack.
- Confirme com o `curl` do Passo 4 que o proxy está mesmo respondendo antes
  de suspeitar do plugin.
- Desative o toggle **Enabled** do plugin pra voltar ao normal enquanto
  investiga.
- Feche e abra o discord por completo. 

## Créditos

- [Gluetun](https://github.com/qdm12/gluetun), de qdm12, o container que
  faz o trabalho pesado de conectar na VPN e expor o proxy.
- [Vencord](https://github.com/Vendicated/Vencord), o client mod que
  torna esse plugin possível.
