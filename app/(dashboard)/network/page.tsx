'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Network, Globe, Server, Plus, RefreshCw, Trash2, Shield, Edit, Settings, PowerOff, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

import { 
  fetchNetworkDataAction, 
  createProxyHostAction, 
  updateDNSAction, 
  fetchProxiesAction, 
  deleteProxyAction,
  editProxyHostAction,
  updateInterfaceIPAction,
  fetchKvmNetworksAction,
  toggleKvmNetworkAction
} from './actions'

export default function NetworkPage() {
  // --- ESTADOS GERAIS ---
  const [data, setData] = useState<any>({ interfaces: [], dns: { nameservers: [] } })
  const [proxies, setProxies] = useState<any[]>([])
  const [kvmNetworks, setKvmNetworks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // --- ESTADOS DE DNS ---
  const [newDns, setNewDns] = useState('')
  const [isUpdatingDns, setIsUpdatingDns] = useState(false)

  // --- ESTADOS DE PROXY REVERSO ---
  const [isProxyModalOpen, setIsProxyModalOpen] = useState(false)
  const [isSavingProxy, setIsSavingProxy] = useState(false)
  const [isDeletingProxy, setIsDeletingProxy] = useState<string | null>(null)
  const [editingProxyId, setEditingProxyId] = useState<string | null>(null)
  const [proxyForm, setProxyForm] = useState({ domain: '', target: '', port: 80, ssl: false, websocket: false })

  // --- ESTADOS DE INTERFACE (NETPLAN) ---
  const [isIfaceModalOpen, setIsIfaceModalOpen] = useState(false)
  const [isSavingIface, setIsSavingIface] = useState(false)
  const [selectedIface, setSelectedIface] = useState<string>('')
  const [ifaceForm, setIfaceForm] = useState({ dhcp: false, ip: '', mask: '24', gateway: '' })

  // --- ESTADOS DO KVM ---
  const [isTogglingKvm, setIsTogglingKvm] = useState<string | null>(null)

  // --- CARREGAMENTO INICIAL ---
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [netRes, proxyRes, kvmRes] = await Promise.all([
        fetchNetworkDataAction(),
        fetchProxiesAction(),
        fetchKvmNetworksAction()
      ])
      setData(netRes)
      setProxies(proxyRes)
      setKvmNetworks(kvmRes)
    } catch (error) {
      console.error("Erro ao carregar dados de rede:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // --- HANDLERS: DNS ---
  const handleAddDns = async () => {
    if (!newDns) return
    setIsUpdatingDns(true)
    try {
      const updatedList = [...data.dns.nameservers, newDns]
      await updateDNSAction(updatedList)
      setNewDns('')
      await loadData(true)
    } catch (e: any) { alert("Erro ao adicionar DNS: " + e.message) }
    finally { setIsUpdatingDns(false) }
  }

  const handleRemoveDns = async (dnsToRemove: string) => {
    setIsUpdatingDns(true)
    try {
      const updatedList = data.dns.nameservers.filter((ns: string) => ns !== dnsToRemove)
      await updateDNSAction(updatedList)
      await loadData(true)
    } catch (e: any) { alert("Erro ao remover DNS: " + e.message) }
    finally { setIsUpdatingDns(false) }
  }

  // --- HANDLERS: PROXY REVERSO ---
  const openCreateProxyModal = () => {
    setEditingProxyId(null)
    setProxyForm({ domain: '', target: '', port: 80, ssl: false, websocket: false })
    setIsProxyModalOpen(true)
  }

  const openEditProxyModal = (proxy: any) => {
    setEditingProxyId(proxy.id)
    setProxyForm({
      domain: proxy.domain,
      target: proxy.target,
      port: proxy.port,
      ssl: proxy.ssl,
      websocket: proxy.websocket
    })
    setIsProxyModalOpen(true)
  }

  const handleSaveProxy = async () => {
    if (!proxyForm.domain || !proxyForm.target) return
    setIsSavingProxy(true)
    try {
      if (editingProxyId) {
        await editProxyHostAction(editingProxyId, proxyForm)
      } else {
        await createProxyHostAction(proxyForm)
      }
      setIsProxyModalOpen(false)
      await loadData(true)
    } catch (e: any) { alert("Erro ao salvar Proxy: " + e.message) }
    finally { setIsSavingProxy(false) }
  }

  const handleDeleteProxy = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover este Proxy Host?")) return;
    setIsDeletingProxy(id)
    try {
      await deleteProxyAction(id)
      await loadData(true)
    } catch (e: any) { alert("Erro ao excluir: " + e.message) }
    finally { setIsDeletingProxy(null) }
  }

  // --- HANDLERS: INTERFACES (NETPLAN) ---
  const openIfaceConfig = (iface: any) => {
    setSelectedIface(iface.name)
    const ipv4 = iface.addresses?.find((a: any) => a.family === 'inet')
    
    setIfaceForm({
      dhcp: false,
      ip: ipv4 ? ipv4.address : '',
      mask: ipv4 ? ipv4.mask.toString() : '24',
      gateway: '' 
    })
    setIsIfaceModalOpen(true)
  }

  const handleSaveIface = async () => {
    if (!ifaceForm.dhcp && (!ifaceForm.ip || !ifaceForm.mask)) {
      alert("Para IP Estático, preencha o IP e a Máscara.");
      return;
    }
    
    if (!confirm(`ATENÇÃO: Alterar o IP de ${selectedIface} pode causar perda de conexão com o painel se esta for sua interface principal. Se isso acontecer, acesse o painel pelo novo IP. Deseja continuar?`)) return;

    setIsSavingIface(true)
    try {
      await updateInterfaceIPAction({ iface: selectedIface, ...ifaceForm })
      setIsIfaceModalOpen(false)
      await loadData(true)
      alert("Configuração aplicada com sucesso!")
    } catch (e: any) { 
      alert("Erro ao configurar interface: " + e.message) 
    } finally { 
      setIsSavingIface(false) 
    }
  }

  // --- HANDLERS: KVM REDES ---
  const handleKvmToggle = async (name: string, action: 'start' | 'destroy' | 'autostart' | 'disable-autostart') => {
    setIsTogglingKvm(name)
    try {
      await toggleKvmNetworkAction(name, action)
      await loadData(true)
    } catch (e: any) { alert("Erro ao alterar rede KVM: " + e.message) }
    finally { setIsTogglingKvm(null) }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Rede e Proxy</h1>
          <p className="text-muted-foreground text-sm">Gerencie interfaces locais, DNS, KVM e Nginx Reverse Proxy</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadData()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Atualizar
        </Button>
      </div>

      <Tabs defaultValue="interfaces">
        <TabsList>
          <TabsTrigger value="interfaces">Interfaces Físicas</TabsTrigger>
          <TabsTrigger value="kvm">Redes KVM</TabsTrigger>
          <TabsTrigger value="dns">Servidores DNS</TabsTrigger>
          <TabsTrigger value="proxy">Reverse Proxy</TabsTrigger>
        </TabsList>

        {/* === ABA 1: INTERFACES FÍSICAS === */}
        <TabsContent value="interfaces" className="grid gap-4 md:grid-cols-3 mt-4">
          {data.interfaces
            .filter((iface: any) => 
              iface.name !== 'virbr0' && 
              iface.name !== 'docker0' && 
              !iface.name.startsWith('veth') // Esconde também as interfaces temporárias dos containers
            )
            .map((iface: any) => (
            <Card key={iface.name} className="flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-primary"/>
                  <CardTitle className="text-sm font-bold">{iface.name}</CardTitle>
                </div>
                <Badge variant={iface.state === 'up' ? (iface.name === 'lo' ? 'secondary' : 'default') : 'destructive'}>
                  {iface.state}
                </Badge>
              </CardHeader>
              <CardContent className="text-xs space-y-2 flex-1 flex flex-col">
                <div className="flex-1 space-y-2">
                  {iface.addresses && iface.addresses.length > 0 ? (
                    iface.addresses.map((addr: any, idx: number) => {
                      const isIPv6 = addr.family === 'inet6';
                      return (
                        <div key={idx} className="flex justify-between items-center gap-4">
                          <span className="text-muted-foreground whitespace-nowrap">
                            {isIPv6 ? 'IPv6/Prefix:' : 'IPv4/Mask:'}
                          </span>
                          <code className="font-bold text-right break-all">
                            {addr.address}/{addr.mask}
                          </code>
                        </div>
                      )
                    })
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Endereço IP:</span>
                      <span className="text-muted-foreground italic">Não configurado</span>
                    </div>
                  )}

                  {iface.mac && iface.mac !== '00:00:00:00:00:00' && (
                    <div className="pt-2 border-t flex justify-between items-center mt-2">
                      <span className="text-muted-foreground">MAC Address:</span>
                      <code className="text-[10px] uppercase">{iface.mac}</code>
                    </div>
                  )}
                </div>

                {/* Botão de Configuração (Esconde de loops e interfaces virtuais) */}
                {iface.name !== 'lo' && 
                 iface.name !== 'docker0' && 
                 iface.name !== 'virbr0' && 
                 !iface.name.startsWith('veth') && 
                 !iface.name.startsWith('br-') && (
                  <div className="pt-3 mt-3 border-t flex justify-end">
                    <Button variant="secondary" size="sm" onClick={() => openIfaceConfig(iface)}>
                      <Settings className="h-3 w-3 mr-2" /> Configurar IP
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* === ABA 2: REDES KVM === */}
        <TabsContent value="kvm" className="mt-4 space-y-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome da Rede</TableHead>
                  <TableHead>Interface Virtual</TableHead>
                  <TableHead>IP / Máscara</TableHead>
                  <TableHead>Range DHCP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kvmNetworks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhuma rede virtual KVM encontrada. Verifique se o libvirtd está rodando.
                    </TableCell>
                  </TableRow>
                ) : (
                  kvmNetworks.map((net) => (
                    <TableRow key={net.name}>
                      <TableCell className="font-bold">{net.name}</TableCell>
                      <TableCell><code className="text-xs bg-muted/30 px-2 py-1 rounded">{net.bridge}</code></TableCell>
                      <TableCell><code className="text-xs">{net.ip}</code></TableCell>
                      <TableCell><code className="text-xs">{net.dhcp}</code></TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          <Badge variant={net.active ? 'default' : 'destructive'} className={net.active ? "bg-success hover:bg-success/80" : ""}>
                            {net.active ? 'Ativa' : 'Inativa'}
                          </Badge>
                          {net.autostart && <span className="text-[10px] text-muted-foreground">Autostart ON</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleKvmToggle(net.name, net.autostart ? 'disable-autostart' : 'autostart')}
                            disabled={isTogglingKvm === net.name}
                            title="Alternar Inicialização Automática"
                          >
                            <RefreshCw className={cn("h-4 w-4", net.autostart ? "text-primary" : "text-muted-foreground")} />
                          </Button>
                          {net.active ? (
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={() => handleKvmToggle(net.name, 'destroy')}
                              disabled={isTogglingKvm === net.name}
                              title="Desligar Rede"
                            >
                              <PowerOff className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button 
                              className="bg-success text-white hover:bg-success/80" 
                              size="sm"
                              onClick={() => handleKvmToggle(net.name, 'start')}
                              disabled={isTogglingKvm === net.name}
                              title="Ligar Rede"
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* === ABA 3: DNS === */}
        <TabsContent value="dns" className="mt-4 max-w-2xl">
          <Card>
            <CardHeader><CardTitle className="text-base">Servidores DNS Resolvers</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {data.dns.nameservers.length === 0 && (
                <p className="text-sm text-muted-foreground italic">Nenhum DNS listado. O sistema usará o Gateway padrão da rede.</p>
              )}
              {data.dns.nameservers.map((ns: string) => (
                <div key={ns} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                  <div className="flex items-center gap-3">
                    <Server className="h-4 w-4 text-primary"/>
                    <code className="font-bold">{ns}</code>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveDns(ns)} disabled={isUpdatingDns}>
                    <Trash2 className="h-4 w-4 text-destructive"/>
                  </Button>
                </div>
              ))}
              <div className="flex gap-2 pt-2 border-t mt-4">
                <Input 
                  placeholder="Adicionar DNS (Ex: 8.8.8.8)" 
                  value={newDns}
                  onChange={(e) => setNewDns(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddDns()}
                  disabled={isUpdatingDns}
                />
                <Button onClick={handleAddDns} disabled={isUpdatingDns || !newDns}>
                  {isUpdatingDns ? "Salvando..." : "Adicionar DNS"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === ABA 4: REVERSE PROXY === */}
        <TabsContent value="proxy" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreateProxyModal}>
              <Plus className="h-4 w-4 mr-2"/> Novo Proxy Host
            </Button>
          </div>
          
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domínio Público</TableHead>
                  <TableHead>Destino Interno</TableHead>
                  <TableHead>Recursos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proxies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhum proxy configurado ainda.
                    </TableCell>
                  </TableRow>
                ) : (
                  proxies.map((host) => (
                    <TableRow key={host.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <span className="font-bold text-sm">{host.domain}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted/30 px-2 py-1 rounded">
                          {host.target}:{host.port}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {host.ssl ? (
                            <Badge variant="outline" className="border-success text-success bg-success/10">
                              <Shield className="mr-1 h-3 w-3" /> HTTPS
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">HTTP</Badge>
                          )}
                          {host.websocket && (
                            <Badge variant="secondary" className="text-[10px]">WS</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="bg-success hover:bg-success/80">Ativo</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => openEditProxyModal(host)}
                          disabled={isDeletingProxy === host.id}
                        >
                          <Edit className="h-4 w-4 text-primary" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDeleteProxy(host.id)}
                          disabled={isDeletingProxy === host.id}
                        >
                          <Trash2 className={cn("h-4 w-4 text-destructive", isDeletingProxy === host.id && "opacity-50")} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* === MODAL: PROXY REVERSO === */}
      <Dialog open={isProxyModalOpen} onOpenChange={setIsProxyModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProxyId ? 'Editar Host Nginx' : 'Criar Host Nginx'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Domínio Público</Label>
              <Input placeholder="app.meudominio.com" value={proxyForm.domain} onChange={e => setProxyForm({...proxyForm, domain: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>IP de Destino (Interno)</Label>
                <Input placeholder="192.168.1.100" value={proxyForm.target} onChange={e => setProxyForm({...proxyForm, target: e.target.value})} />
              </div>
              <div className="grid gap-2">
                <Label>Porta Interna</Label>
                <Input type="number" value={proxyForm.port || ''} onChange={e => setProxyForm({...proxyForm, port: parseInt(e.target.value)})} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Gerar SSL Let's Encrypt (HTTPS)</Label>
              <Switch checked={proxyForm.ssl} onCheckedChange={v => setProxyForm({...proxyForm, ssl: v})} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Suporte a WebSocket</Label>
              <Switch checked={proxyForm.websocket} onCheckedChange={v => setProxyForm({...proxyForm, websocket: v})} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveProxy} disabled={isSavingProxy}>
              {isSavingProxy ? "Salvando..." : (editingProxyId ? "Salvar Alterações" : "Criar Proxy")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === MODAL: CONFIGURAÇÃO DE INTERFACE === */}
      <Dialog open={isIfaceModalOpen} onOpenChange={setIsIfaceModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Interface {selectedIface}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-center justify-between border-b pb-4">
              <Label className="text-base">Obter IP Automaticamente (DHCP)</Label>
              <Switch checked={ifaceForm.dhcp} onCheckedChange={v => setIfaceForm({...ifaceForm, dhcp: v})} />
            </div>

            {!ifaceForm.dhcp && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2 col-span-2">
                    <Label>Endereço IPv4</Label>
                    <Input placeholder="Ex: 192.168.1.100" value={ifaceForm.ip} onChange={e => setIfaceForm({...ifaceForm, ip: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Máscara (CIDR)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-lg">/</span>
                      <Input type="number" placeholder="24" value={ifaceForm.mask} onChange={e => setIfaceForm({...ifaceForm, mask: e.target.value})} />
                    </div>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Gateway Padrão (Opcional)</Label>
                  <Input placeholder="Ex: 192.168.1.1" value={ifaceForm.gateway} onChange={e => setIfaceForm({...ifaceForm, gateway: e.target.value})} />
                  <p className="text-[10px] text-muted-foreground">Deixe em branco se esta interface não for a saída principal para a internet.</p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleSaveIface} disabled={isSavingIface}>
              {isSavingIface ? "Aplicando..." : "Salvar e Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}