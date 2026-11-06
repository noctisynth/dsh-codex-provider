export const loginMethods = [
  { id: 'siwc', label: 'Sign in with ChatGPT', description: '通过 SIWC 授权使用 ChatGPT 套餐。' },
  {
    id: 'codex-browser',
    label: 'Codex 浏览器（legacy）',
    description: '在浏览器中完成 Codex 登录。',
  },
  {
    id: 'codex-device',
    label: 'Codex 设备码（legacy）',
    description: '打开验证页面并输入设备码。',
  },
] as const

export function loginMethodLabel(method: string) {
  switch (method) {
    case 'siwc':
      return 'SIWC'
    case 'codex-browser':
      return 'Codex · 浏览器'
    case 'codex-device':
      return 'Codex · 设备码'
  }
}
