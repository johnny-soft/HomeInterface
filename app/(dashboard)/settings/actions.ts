'use server'

import { executeCommand } from '@/lib/shell-executor'
import { revalidatePath } from 'next/cache'
import fs from 'fs/promises'
import path from 'path'

const DATA_DIR = "/opt/homelab/data"
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')
const NOTIFS_FILE = path.join(DATA_DIR, 'notifications.json')

/**
 * Função utilitária para garantir que os arquivos existam 
 * e pertençam ao usuário correto do sistema.
 */
async function ensureFileExists(filePath: string, defaultData: any) {
  try {
    // Tenta acessar o arquivo
    await fs.access(filePath)
  } catch (error: any) {
    // Se o arquivo não existe ou não tem permissão
    if (error.code === 'ENOENT' || error.code === 'EACCES') {
      // Cria a pasta base via sudo
      await executeCommand('sudo', ['mkdir', '-p', DATA_DIR])
      await executeCommand('sudo', ['chmod', '777', DATA_DIR])
      
      // Salva o JSON na pasta /tmp (que é livre para qualquer usuário)
      const tempPath = path.join('/tmp', path.basename(filePath))
      await fs.writeFile(tempPath, JSON.stringify(defaultData, null, 2))
      
      // Move o arquivo para o /opt/homelab usando sudo e dá permissão 666 (leitura/escrita para todos)
      await executeCommand('sudo', ['cp', tempPath, filePath])
      await executeCommand('sudo', ['chmod', '666', filePath])
    } else {
      throw error
    }
  }
}

// ==========================================
// GESTÃO DE USUÁRIOS
// ==========================================

export async function fetchUsersAction() {
  const defaultAdmin = [{ id: '1', username: 'admin', password: 'admin', role: 'admin' }]
  await ensureFileExists(USERS_FILE, defaultAdmin)
  
  try {
    const data = await fs.readFile(USERS_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : defaultAdmin
  } catch {
    return defaultAdmin
  }
}

export async function createUserAction(formData: any) {
  const users = await fetchUsersAction()
  
  if (users.some((u: any) => u.username === formData.username)) {
    throw new Error("Usuário já existe.")
  }
  
  users.push({ id: Date.now().toString(), ...formData })
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2))
  revalidatePath('/settings')
  return { success: true }
}

export async function deleteUserAction(id: string) {
  const users = await fetchUsersAction()
  const updated = users.filter((u: any) => u.id !== id || u.username === 'admin')
  await fs.writeFile(USERS_FILE, JSON.stringify(updated, null, 2))
  revalidatePath('/settings')
  return { success: true }
}

// ==========================================
// CONFIGURAÇÕES GERAIS
// ==========================================

export async function getSettings() {
  const defaultSettings = { 
    hostname: 'homelab', 
    location: '',
    telegramEnabled: false, 
    telegramToken: '', 
    telegramChatId: '' 
  }
  await ensureFileExists(SETTINGS_FILE, defaultSettings)
  
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return defaultSettings
  }
}

export async function updateGeneralSettingsAction(formData: any) {
  await ensureFileExists(SETTINGS_FILE, formData)
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(formData, null, 2))
  
  // Atualiza o hostname no sistema Linux, caso alterado
  if (formData.hostname) {
    await executeCommand('sudo', ['hostnamectl', 'set-hostname', formData.hostname])
  }
  
  revalidatePath('/settings')
  return { success: true }
}

// ==========================================
// NOTIFICAÇÕES & TELEGRAM
// ==========================================

export async function fetchNotificationsAction() {
  await ensureFileExists(NOTIFS_FILE, [])
  try {
    const data = await fs.readFile(NOTIFS_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function sendTestNotificationAction() {
  const settings = await getSettings()
  const data = await fetchNotificationsAction()
  
  data.unshift({
    id: Date.now(),
    title: "Teste de Integração",
    message: "O sistema de alertas e notificações está online.",
    date: new Date().toISOString(),
    read: false
  })
  
  // Mantém apenas as últimas 15 notificações salvas
  await fs.writeFile(NOTIFS_FILE, JSON.stringify(data.slice(0, 15), null, 2))

  // Disparo para a API do Telegram em background
  if (settings.telegramEnabled && settings.telegramToken && settings.telegramChatId) {
    const url = `https://api.telegram.org/bot${settings.telegramToken}/sendMessage`
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: settings.telegramChatId,
        text: `🚀 *HomeLab Manager*\nSua integração com o Telegram está funcionando perfeitamente!`,
        parse_mode: 'Markdown'
      })
    }).catch(e => console.error("Erro background Telegram:", e))
  }

  revalidatePath('/')
  return { success: true }
}
export async function markAllAsReadAction() {
  const data = await fetchNotificationsAction()
  
  // Muda o status de todas as notificações para lidas
  const updated = data.map((n: any) => ({ ...n, read: true }))
  
  await fs.writeFile(NOTIFS_FILE, JSON.stringify(updated, null, 2))
  revalidatePath('/')
  return { success: true }
}