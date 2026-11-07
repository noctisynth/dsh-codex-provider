export const loginMethods = [
  { id: 'siwc', label: 'Continue with ChatGPT', description: 'Use your ChatGPT plan.' },
  {
    id: 'codex-browser',
    label: 'Codex browser (legacy)',
    description: 'Complete Codex sign-in in your browser.',
  },
  {
    id: 'codex-device',
    label: 'Codex device code (legacy)',
    description: 'Open the verification page and enter the device code.',
  },
] as const

export function loginMethodLabel(method: string) {
  switch (method) {
    case 'siwc':
      return 'SIWC'
    case 'codex-browser':
      return 'Codex · Browser (legacy)'
    case 'codex-device':
      return 'Codex · Device code (legacy)'
    default:
      return method
  }
}
