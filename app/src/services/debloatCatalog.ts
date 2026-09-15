export interface DebloatCatalogItem {
  id: string
  label: string
  recommended: boolean
}

/**
 * Espelho visual da allowlist nativa. Itens essenciais (Store, WebView2, Edge,
 * Defender, Windows Update, App Installer) deliberadamente não fazem parte dela.
 */
export const DEBLOAT_CATALOG: DebloatCatalogItem[] = [
  { id: 'feedback-hub', label: 'Feedback Hub', recommended: true },
  { id: 'copilot', label: 'Microsoft Copilot', recommended: true },
  { id: 'weather', label: 'MSN Weather', recommended: true },
  { id: 'family', label: 'Microsoft Family', recommended: true },
  { id: 'office-hub', label: 'Microsoft 365 / Office Hub', recommended: true },
  { id: 'bing-search', label: 'Bing Search', recommended: true },
  { id: 'clipchamp', label: 'Clipchamp', recommended: true },
  { id: 'teams', label: 'Microsoft Teams (consumer)', recommended: true },
  { id: 'bing-news', label: 'MSN News', recommended: true },
  { id: 'solitaire', label: 'Microsoft Solitaire', recommended: true },
  { id: 'power-automate', label: 'Power Automate Desktop', recommended: true },
  { id: 'dev-home', label: 'Windows Dev Home', recommended: true },
  { id: 'get-started', label: 'Windows Get Started', recommended: true },
  { id: 'quick-assist', label: 'Quick Assist', recommended: false },
  { id: 'todo', label: 'Microsoft To Do', recommended: false },
  { id: 'outlook', label: 'Outlook for Windows', recommended: false },
  { id: 'alarms', label: 'Clock / Alarms', recommended: false },
  { id: 'get-help', label: 'Windows Get Help', recommended: false },
  { id: 'sticky-notes', label: 'Microsoft Sticky Notes', recommended: false },
  { id: 'camera', label: 'Windows Camera', recommended: false },
  { id: 'sound-recorder', label: 'Sound Recorder', recommended: false },
  { id: 'snipping-tool', label: 'Snipping Tool', recommended: false },
  { id: 'onedrive', label: 'Microsoft OneDrive', recommended: false },
  { id: 'xbox-suite', label: 'Xbox / Game Pass suite', recommended: false },
  { id: 'phone-link', label: 'Phone Link', recommended: false },
  { id: 'maps', label: 'Windows Maps', recommended: false },
  { id: 'people', label: 'Microsoft People', recommended: false },
  { id: 'mixed-reality', label: 'Mixed Reality Portal', recommended: false },
  { id: 'mail-calendar', label: 'Mail and Calendar (legacy)', recommended: false },
  { id: 'movies-tv', label: 'Movies & TV', recommended: false },
  { id: 'media-player', label: 'Legacy Media Player / Groove', recommended: false },
]

export const DEBLOAT_BY_ID = new Map(DEBLOAT_CATALOG.map((item) => [item.id, item]))
