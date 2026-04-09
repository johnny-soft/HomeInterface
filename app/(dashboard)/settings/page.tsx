'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch' // Certifique-se de ter este componente do Shadcn
import { Plus, Trash2, UserCog, Save, BellRing, Server, MapPin } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { 
  createUserAction, 
  fetchUsersAction, 
  deleteUserAction, 
  updateGeneralSettingsAction, 
  getSettings, 
  sendTestNotificationAction 
} from './actions'

export default function SettingsPage() {
  const { can } = useAuth()
  
  // Estados
  const [users, setUsers] = useState<any[]>([])
  const [config, setConfig] = useState<any>({ 
    hostname: '', 
    location: '', 
    telegramToken: '', 
    telegramChatId: '', 
    telegramEnabled: false 
  })
  const [showUserModal, setShowUserModal] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', email: '', role: 'viewer' })

  // Carregamento inicial
  const loadData = async () => {
    const [fetchedUsers, fetchedSettings] = await Promise.all([
      fetchUsersAction(),
      getSettings()
    ])
    setUsers(fetchedUsers)
    
    // Mescla com valores padrão caso o JSON esteja vazio
    setConfig({
      hostname: fetchedSettings.hostname || 'homelab-server',
      location: fetchedSettings.location || 'Campo Grande, MS',
      telegramToken: fetchedSettings.telegramToken || '',
      telegramChatId: fetchedSettings.telegramChatId || '',
      telegramEnabled: fetchedSettings.telegramEnabled || false
    })
  }

  useEffect(() => { loadData() }, [])

  // Handlers de Ação
  const handleSaveConfig = async () => {
    try {
      await updateGeneralSettingsAction(config)
      alert("Configurações do servidor atualizadas com sucesso!")
    } catch (e: any) {
      alert("Erro ao salvar: " + e.message)
    }
  }

  const handleCreateUser = async () => {
    try {
      await createUserAction(newUser)
      setShowUserModal(false)
      setNewUser({ username: '', password: '', email: '', role: 'viewer' })
      loadData()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleTestTelegram = async () => {
    try {
      await sendTestNotificationAction()
      alert("Notificação de teste enviada para o Telegram em background.")
    } catch (e) {
      alert("Erro ao disparar notificação.")
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações do Sistema</h1>
        <p className="text-muted-foreground">Gerencie a identidade, acessos e integrações do nó.</p>
      </div>
      
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full md:w-[400px] grid-cols-3">
          <TabsTrigger value="general">Geral</TabsTrigger>
          {can('manageUsers') && <TabsTrigger value="users">Usuários</TabsTrigger>}
          <TabsTrigger value="notifications">Alertas</TabsTrigger>
        </TabsList>

        {/* ================= ABA 1: GERAL ================= */}
        <TabsContent value="general" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5"/> Identidade do Nó</CardTitle>
              <CardDescription>Altere o hostname da máquina no sistema operacional e o local físico.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-xl">
              <div className="space-y-2">
                <Label htmlFor="hostname">Hostname (Linux)</Label>
                <Input 
                  id="hostname" 
                  disabled={!can('editSettings')} 
                  value={config.hostname} 
                  onChange={e => setConfig({...config, hostname: e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground"/> Localidade da Instalação
                </Label>
                <Input 
                  id="location" 
                  placeholder="Ex: Campus IFMS / Rack Principal"
                  disabled={!can('editSettings')} 
                  value={config.location} 
                  onChange={e => setConfig({...config, location: e.target.value})} 
                />
              </div>
            </CardContent>
            {can('editSettings') && (
              <CardFooter className="border-t border-border pt-4">
                <Button onClick={handleSaveConfig}><Save className="mr-2 h-4 w-4"/> Salvar Alterações</Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        {/* ================= ABA 2: USUÁRIOS ================= */}
        <TabsContent value="users" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowUserModal(true)}>
              <Plus className="mr-2 h-4 w-4"/> Novo Acesso
            </Button>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase text-[10px]">{u.role}</Badge></TableCell>
                    <TableCell className="text-right">
                      {u.username !== 'admin' && (
                        <Button variant="ghost" size="icon" onClick={() => deleteUserAction(u.id).then(loadData)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ================= ABA 3: NOTIFICAÇÕES ================= */}
        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5"/> Integração Telegram API</CardTitle>
              <CardDescription>Configure um bot do Telegram para receber alertas de uso de disco, queda de containers e acessos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 max-w-xl">
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Ativar Alertas via Telegram</Label>
                  <p className="text-sm text-muted-foreground">O serviço enviará pings em background.</p>
                </div>
                <Switch 
                  disabled={!can('editSettings')} 
                  checked={config.telegramEnabled}
                  onCheckedChange={(checked) => setConfig({...config, telegramEnabled: checked})}
                />
              </div>

              {config.telegramEnabled && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="space-y-2">
                    <Label htmlFor="bot-token">Bot Token (BotFather)</Label>
                    <Input 
                      id="bot-token" 
                      type="password"
                      placeholder="1234567890:AAH_XYZ..." 
                      disabled={!can('editSettings')} 
                      value={config.telegramToken} 
                      onChange={e => setConfig({...config, telegramToken: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="chat-id">Chat ID Destino</Label>
                    <Input 
                      id="chat-id" 
                      placeholder="Ex: -10012345678" 
                      disabled={!can('editSettings')} 
                      value={config.telegramChatId} 
                      onChange={e => setConfig({...config, telegramChatId: e.target.value})} 
                    />
                  </div>
                </div>
              )}
            </CardContent>
            {can('editSettings') && (
              <CardFooter className="border-t border-border pt-4 flex gap-3">
                <Button onClick={handleSaveConfig}><Save className="mr-2 h-4 w-4"/> Salvar API</Button>
                {config.telegramEnabled && (
                  <Button variant="secondary" onClick={handleTestTelegram}>Disparar Teste</Button>
                )}
              </CardFooter>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODAL DE CADASTRO */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserCog className="h-5 w-5" /> Adicionar Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome de Usuário</Label>
              <Input placeholder="Ex: operador_infra" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Senha Temporária</Label>
              <Input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Nível de Acesso (Role)</Label>
              <Select onValueChange={v => setNewUser({...newUser, role: v as any})}>
                <SelectTrigger><SelectValue placeholder="Selecione a permissão" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador (Total)</SelectItem>
                  <SelectItem value="operator">Operador (Containers/VMs)</SelectItem>
                  <SelectItem value="viewer">Viewer (Somente Leitura)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full mt-4" onClick={handleCreateUser}>Salvar Credencial</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}