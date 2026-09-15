# Política de debloat do RESYNC

## Referências

- O catálogo foi revisado contra o preset `AppxDefault` e o preset `Standard` do
  [ChrisTitusTech/winutil](https://github.com/ChrisTitusTech/winutil), licenciado em MIT.
- A implementação do RESYNC é própria e usa os cmdlets documentados pela Microsoft:
  `Remove-AppxPackage` para contas existentes e `Remove-AppxProvisionedPackage` para
  impedir o provisionamento em novas contas.

## Proteções obrigatórias

- A interface envia somente IDs; o backend Rust valida uma allowlist fixa e o script
  PowerShell resolve internamente os nomes exatos dos pacotes.
- Microsoft Store, Desktop App Installer/winget, Edge, WebView2, Defender, Windows
  Update e componentes de segurança nunca entram no catálogo.
- Itens de uso comum ou com impacto em jogos (OneDrive, Xbox, Outlook, Câmera,
  Ferramenta de Captura etc.) são opcionais e ficam desmarcados.
- O L1 tenta criar um ponto de restauração antes da primeira remoção e registra o
  resultado verdadeiro. O Windows pode recusar outro ponto no intervalo de 24 horas.
- Remoção de aplicativos não é anunciada como reversível: reinstalação posterior é
  feita pela Microsoft Store/winget quando aplicável.

## Ajustes não adotados

- Nenhuma alteração de HPET/BCD. Em especial, `useplatformclock true` força o relógio
  de plataforma e a própria Microsoft classifica essa opção como destinada a depuração.
- Nenhuma remoção de Defender, Windows Update, Store, Edge/WebView2 ou controles de
  segurança como VBS/HVCI.
- Nenhum download e execução remota (`irm | iex`) dentro do produto.
