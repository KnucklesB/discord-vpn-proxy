# Roteando o Discord por um proxy VPN self-hosted (Portainer + Gluetun + ProtonVPN + Vencord)

O Discord teve suas transmissões de tela e o compartilhamento de webcams banidos por causa da medida cautelar da [ANPD (Autoridade Nacional de Proteção de Dados)](https://www.gov.br/anpd/pt-br).

Como eu preciso dessas ferramentas para trabalho e lazer, resolvi criar uma maneira de contornar essa restrição sem usar uma VPS ou uma VPN no computador inteiro.

Testei várias abordagens (Cloudflared não serve para isso, proxies públicos são furada) e cheguei a uma combinação que funciona de verdade: **Portainer + Gluetun + ProtonVPN (plano grátis) + um plugin próprio para o Vencord**.

Este repositório documenta o processo desde o zero, incluindo os erros que enfrentei no caminho, porque, na hora de debugar, foi justamente isso que mais me ajudou.

## O que essa stack faz

* Sobe um container `gluetun` no meu servidor doméstico (gerenciado pelo Portainer), que se conecta a um servidor da ProtonVPN e expõe um proxy SOCKS5 na minha rede local.
* Um plugin do Vencord (`ProxySettings`) aponta **somente o tráfego de rede do Discord** para esse proxy. Nada mais no meu PC ou na minha rede é afetado.
* Resultado: o Discord passa a enxergar a internet a partir do IP do servidor VPN, sem eu precisar usar uma VPN paga no computador inteiro ou sofrer com ping alto e baixa velocidade em toda a conexão.

## O que essa stack **não** resolve

Documentando aqui para que quem for usar isso não tenha surpresas:

* **Chamadas de voz podem não seguir o proxy.** O Discord usa WebRTC para áudio/vídeo, e é um comportamento conhecido do Chromium (base do Electron) que esse tráfego às vezes ignore o proxy configurado no aplicativo. Ou seja: API, gateway e conteúdo são carregados pelo IP do proxy, mas a chamada de voz pode continuar medindo a latência real e escolhendo o servidor com base na minha localização de verdade.
* **Plano grátis da ProtonVPN = países fixos e sem escolha manual de servidor.** Não dá para escolher um endpoint específico, apenas o país (via `SERVER_COUNTRIES`), e somente entre os países liberados no plano grátis: Canadá, EUA, México, Holanda, Noruega, Polônia, Romênia, Cingapura, Suíça e Japão.
* **Um dispositivo por vez.** O plano grátis da ProtonVPN aceita apenas uma conexão simultânea. Se o aplicativo oficial estiver conectado em outro lugar, o túnel poderá falhar na autenticação.

## Pré-requisitos

* Um servidor/computador ligado 24/7 na sua rede (no meu caso, uso um servidor para outros containers).
* [Docker](https://get.docker.com) instalado nele.
* [Portainer CE](https://docs.portainer.io) rodando nesse Docker.
* Uma conta grátis na [ProtonVPN](https://protonvpn.com).
* Uma build de desenvolvimento do [Vencord](https://github.com/Vendicated/Vencord).

## Passo 1 — Instalar o Portainer (se ainda não tiver)

Acesse https://docs.portainer.io/start/install-ce/server/docker/linux para seguir o processo de instalação.

## Passo 2 — Pegar as credenciais da ProtonVPN

**Importante:** não use o e-mail e a senha normais da sua conta. A Proton gera credenciais separadas, específicas para aplicativos de terceiros (o Gluetun é um deles).

1. Acesse [account.proton.me/u/0/vpn/OpenVpnIKEv2](https://account.proton.me/u/0/vpn/OpenVpnIKEv2).
2. Vá em **Proton VPN → OpenVPN → Credentials**.
3. Copie o **OpenVPN username** e a **OpenVPN password** mostrados ali.
4. Se, em algum momento, a autenticação começar a falhar sem motivo aparente, volte a essa página e clique em **Reset credentials** para gerar um novo login.

## Passo 3 — Criar o stack no Portainer

No Portainer, vá em **Stacks → Add stack**, dê o nome `protonvpn-proxy` e cole o seguinte no **Web editor**:

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

Troque `OPENVPN_USER` e `OPENVPN_PASSWORD` pelas credenciais obtidas no Passo 2 e clique em **Deploy the stack**.

### As duas variáveis que mais me deram dor de cabeça

* **`FREE_ONLY=on`**

  Sem essa variável, o Gluetun pode escolher qualquer servidor do país selecionado, incluindo servidores **pagos**. Como minha conta é grátis, a Proton recusa a autenticação nesses servidores, e o erro que aparece (`AUTH_FAILED`) não deixa isso tão óbvio.

* **`SOCKS5_USER` / `SOCKS5_PASSWORD` vazios**

  O Gluetun possui um proxy SOCKS5 embutido que pode exigir usuário e senha, mas o Chromium (motor por trás do Discord/Electron) **não suporta autenticação em proxy SOCKS5**.

  Se esses campos forem preenchidos, o Discord não conseguirá se conectar ao proxy. Portanto, deixe-os sem autenticação e confie no isolamento da sua rede local para a segurança.

## Passo 4 — Testar o proxy antes de mexer no Discord

De qualquer máquina na mesma rede, execute:

```bash
curl -x socks5h://IP-DO-SERVIDOR:1080 https://ifconfig.me
```

Se retornar um IP (e não um erro/timeout), o proxy está funcionando.

Para confirmar o país:

```bash
curl -x socks5h://IP-DO-SERVIDOR:1080 https://ipinfo.io
```

## Passo 5 — Instalar o plugin ProxySettings no Vencord

Não existe um plugin oficial para isso na lista padrão do Vencord, então é necessário utilizar uma build de desenvolvimento com o plugin adicionado manualmente.

```bash
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm install
```

Copie a pasta [`vencord-plugin/ProxySettings`](./vencord-plugin/ProxySettings) deste repositório para dentro de `src/userplugins/` do seu clone do Vencord, ficando assim:

```text
Vencord/src/userplugins/ProxySettings/index.ts
Vencord/src/userplugins/ProxySettings/native.ts
```

Faça o build e injete:

```bash
pnpm build
pnpm inject
```

Selecione a versão do seu Discord.

Reinicie o Discord por completo (caso ele não tenha sido reiniciado automaticamente).

## Passo 6 — Configurar o plugin

No Discord, vá em **Configurações → Vencord → Plugins → ProxySettings** (ícone de engrenagem):

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| Protocol            | `socks5`                                   |
| Host                | IP local do servidor (ex.: `192.168.1.67`) |
| Port                | `1080`                                     |
| Username / Password | deixar em branco                           |

Ative o toggle **Enabled** e reinicie o Discord.

## Troubleshooting

**`AUTH_FAILED` no log do Gluetun**

1. Confirme que está usando as credenciais para aplicativos de terceiros (Passo 2), e não o login normal.
2. Confirme que não há outro dispositivo conectado à ProtonVPN no momento (plano grátis = 1 conexão).
3. Confirme se `FREE_ONLY=on` está presente no stack.
4. Se nada resolver, gere novas credenciais usando **Reset credentials** e espere alguns minutos antes de tentar novamente. A Proton pode bloquear temporariamente tentativas repetidas.

**Discord não conecta / fica travado carregando com o plugin ativado**

* Confirme que `SOCKS5_USER` e `SOCKS5_PASSWORD` estão vazios no stack.
* Confirme, usando o `curl` do Passo 4, que o proxy está realmente respondendo antes de suspeitar do plugin.
* Desative o toggle **Enabled** do plugin para voltar ao funcionamento normal enquanto investiga.
* Feche e abra o Discord completamente.

## Créditos

* [Gluetun](https://github.com/qdm12/gluetun), de qdm12, o container que faz o trabalho pesado de conectar à VPN e expor o proxy.
* [Vencord](https://github.com/Vendicated/Vencord), o client mod que torna esse plugin possível.
