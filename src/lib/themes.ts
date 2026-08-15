export type VisualTheme = {
  id: string
  name: string
  colors: [string, string, string]
  captionColor: string
  captionBg: string
}

export const THEMES: VisualTheme[] = [
  {
    id: 'midnight-teal',
    name: 'Midnight Teal',
    colors: ['#062a2e', '#0b5c5c', '#1a9a8a'],
    captionColor: '#f4faf9',
    captionBg: 'rgba(4, 20, 24, 0.72)',
  },
  {
    id: 'copper-ink',
    name: 'Copper Ink',
    colors: ['#1c120c', '#8a3d1c', '#d9773a'],
    captionColor: '#fff8f1',
    captionBg: 'rgba(20, 10, 6, 0.7)',
  },
  {
    id: 'slate-sky',
    name: 'Slate Sky',
    colors: ['#1a2330', '#355070', '#6b9ac4'],
    captionColor: '#f2f6fb',
    captionBg: 'rgba(12, 18, 28, 0.72)',
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: ['#102016', '#2f5d3a', '#7cb878'],
    captionColor: '#f3faf3',
    captionBg: 'rgba(8, 18, 10, 0.7)',
  },
  {
    id: 'studio-light',
    name: 'Studio Light',
    colors: ['#d9e2ea', '#b7c8d6', '#8aa0b4'],
    captionColor: '#12202c',
    captionBg: 'rgba(255, 255, 255, 0.78)',
  },
]
