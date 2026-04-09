'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Container,
  Play,
  Square,
  RotateCcw,
  Trash2,
  MoreVertical,
  Plus,
  Search,
  FileText,
  Download,
  Image as ImageIcon,
  HardDrive,
  RefreshCw,
  Network,
  Globe
} from 'lucide-react'
import { cn } from '@/lib/utils'

import { 
  fetchContainersAction, startContainerAction, stopContainerAction, restartContainerAction, removeContainerAction, createContainerAction,
  fetchImagesAction, pullImageAction, removeImageAction,
  fetchVolumesAction, createVolumeAction, removeVolumeAction,
  fetchNetworksAction, createNetworkAction, removeNetworkAction
} from './actions'

const statusConfig: Record<string, { label: string, className: string }> = {
  running: { label: 'Ativo', className: 'bg-success/20 text-success' },
  paused: { label: 'Pausado', className: 'bg-warning/20 text-warning' },
  exited: { label: 'Parado', className: 'bg-muted text-muted-foreground' },
  created: { label: 'Criado', className: 'bg-info/20 text-info' },
  restarting: { label: 'Reiniciando', className: 'bg-warning/20 text-warning' },
  dead: { label: 'Morto', className: 'bg-destructive/20 text-destructive' },
  unknown: { label: 'Desconhecido', className: 'bg-muted text-muted-foreground' }
}

function formatBytes(bytes: number | string): string {
  if (!bytes || bytes === 'N/A') return '0 B'
  if (typeof bytes === 'string') return bytes 
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatPorts(ports: any): string {
  if (!ports || !ports.length) return '-'
  if (typeof ports === 'string') return ports
  return ports.map((p: any) => `${p.public}:${p.private}/${p.type}`).join(', ')
}

export default function DockerPage() {
  const [searchContainer, setSearchContainer] = useState('')
  const [searchImage, setSearchImage] = useState('')
  const [searchVolume, setSearchVolume] = useState('')
  const [searchNetwork, setSearchNetwork] = useState('')

  const [containers, setContainers] = useState<any[]>([])
  const [images, setImages] = useState<any[]>([])
  const [volumes, setVolumes] = useState<any[]>([])
  const [networks, setNetworks] = useState<any[]>([])

  const [isLoadingContainers, setIsLoadingContainers] = useState(true)
  const [isLoadingImages, setIsLoadingImages] = useState(true)
  const [isLoadingVolumes, setIsLoadingVolumes] = useState(true)
  const [isLoadingNetworks, setIsLoadingNetworks] = useState(true)

  const [newImageName, setNewImageName] = useState('')
  const [isPulling, setIsPulling] = useState(false)
  const [selectedContainer, setSelectedContainer] = useState<any | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  
  // Estados do Modal de Container
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newContainerName, setNewContainerName] = useState('')
  const [newContainerImage, setNewContainerImage] = useState('')
  const [newContainerPorts, setNewContainerPorts] = useState('')
  const [newContainerEnvs, setNewContainerEnvs] = useState('')
  const [newContainerNetwork, setNewContainerNetwork] = useState('')
  const [newContainerIp, setNewContainerIp] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Estados do Modal de Rede (Novo)
  const [showCreateNetworkDialog, setShowCreateNetworkDialog] = useState(false)
  const [newNetworkName, setNewNetworkName] = useState('')
  const [newNetworkDriver, setNewNetworkDriver] = useState('bridge')
  const [newNetworkSubnet, setNewNetworkSubnet] = useState('')
  const [isCreatingNetwork, setIsCreatingNetwork] = useState(false)

  const loadContainers = async (silent = false) => {
    if (!silent) setIsLoadingContainers(true)
    const data = await fetchContainersAction()
    setContainers(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data)
    if (!silent) setIsLoadingContainers(false)
  }

  const loadImages = async (silent = false) => {
    if (!silent) setIsLoadingImages(true)
    const data = await fetchImagesAction()
    setImages(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data)
    if (!silent) setIsLoadingImages(false)
  }

  const loadVolumes = async (silent = false) => {
    if (!silent) setIsLoadingVolumes(true)
    const data = await fetchVolumesAction()
    setVolumes(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data)
    if (!silent) setIsLoadingVolumes(false)
  }

  const loadNetworks = async (silent = false) => {
    if (!silent) setIsLoadingNetworks(true)
    const data = await fetchNetworksAction()
    setNetworks(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data)
    if (!silent) setIsLoadingNetworks(false)
  }

  const refreshAll = (silent = false) => {
    loadContainers(silent); loadImages(silent); loadVolumes(silent); loadNetworks(silent);
  }

  useEffect(() => {
    refreshAll(false)
    const interval = setInterval(() => refreshAll(true), 3000)
    return () => clearInterval(interval)
  }, [])

  const handleContainerAction = async (id: string, action: 'start' | 'stop' | 'restart' | 'remove') => {
    try {
      if (action === 'start') await startContainerAction(id)
      else if (action === 'stop') await stopContainerAction(id)
      else if (action === 'restart') await restartContainerAction(id)
      else if (action === 'remove' && confirm("Remover container?")) await removeContainerAction(id)
      loadContainers(true)
    } catch (e) { alert("Erro na ação do container") }
  }

  const handleCreateContainer = async () => {
    if (!newContainerImage) return
    setIsCreating(true)
    try {
      await createContainerAction(
        newContainerName, 
        newContainerImage, 
        newContainerPorts, 
        newContainerEnvs,
        newContainerNetwork,
        newContainerIp
      )
      setNewContainerName(''); setNewContainerImage(''); setNewContainerPorts(''); 
      setNewContainerEnvs(''); setNewContainerNetwork(''); setNewContainerIp('');
      setShowCreateDialog(false)
      loadContainers(true)
    } catch (error: any) { alert(error.message) } 
    finally { setIsCreating(false) }
  }

  const handlePullImage = async () => {
    if (!newImageName) return
    setIsPulling(true)
    try {
      await pullImageAction(newImageName)
      setNewImageName('')
      loadImages(true)
    } catch (e) { alert("Erro no Pull") } finally { setIsPulling(false) }
  }

  const handleCreateVolume = async () => {
    const name = prompt("Nome do volume:")
    if (name) { await createVolumeAction(name); loadVolumes(true); }
  }

  // Nova função de criação de rede usando os estados do Modal
  const handleCreateNetwork = async () => {
    if (!newNetworkName) return
    if (!newNetworkSubnet) return alert("A faixa de IP é obrigatória (ex: 192.168.10.0/24).")
    
    setIsCreatingNetwork(true)
    try {
      // Certifique-se de que a sua actions.ts espera (name, driver, subnet)
      await createNetworkAction(newNetworkName.trim(), newNetworkDriver, newNetworkSubnet.trim())
      
      setNewNetworkName('')
      setNewNetworkSubnet('')
      setNewNetworkDriver('bridge')
      setShowCreateNetworkDialog(false)
      loadNetworks(true)
    } catch (error: any) { 
      alert(error.message || "Erro ao criar rede") 
    } finally { 
      setIsCreatingNetwork(false) 
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Docker</h1>
          <p className="text-muted-foreground text-sm">Gerencie seu ambiente local</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refreshAll(false)}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoadingContainers && "animate-spin")} />
            Atualizar
          </Button>
          
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Novo Container</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Configurar Container</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Nome</Label>
                    <Input placeholder="ex: nginx-web" value={newContainerName} onChange={e => setNewContainerName(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Imagem *</Label>
                    <Input placeholder="ex: nginx:latest" value={newContainerImage} onChange={e => setNewContainerImage(e.target.value)} />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Rede e Faixa de IP</Label>
                    <select 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={newContainerNetwork}
                      onChange={e => setNewContainerNetwork(e.target.value)}
                    >
                      <option value="">Padrão (Bridge)</option>
                      {networks.map(n => (
                        <option key={n.id} value={n.name}>
                          {n.name} — {n.subnet}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label>IP Estático na Rede</Label>
                    <Input placeholder="ex: 192.168.50.10" value={newContainerIp} onChange={e => setNewContainerIp(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Portas (ex: 80:80)</Label>
                    <Input placeholder="80:80" value={newContainerPorts} onChange={e => setNewContainerPorts(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Variáveis de Env</Label>
                    <Input placeholder="KEY=VAL, KEY2=VAL2" value={newContainerEnvs} onChange={e => setNewContainerEnvs(e.target.value)} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateContainer} disabled={isCreating || !newContainerImage}>
                  {isCreating ? "Criando..." : "Criar Container"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4 flex items-center justify-between">
          <div><p className="text-sm text-muted-foreground">Containers</p><p className="text-2xl font-bold">{containers.length}</p></div>
          <Container className="h-8 w-8 text-primary" />
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center justify-between">
          <div><p className="text-sm text-muted-foreground">Ativos</p><p className="text-2xl font-bold text-success">{containers.filter(c => c.status === 'running').length}</p></div>
          <Play className="h-8 w-8 text-success" />
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center justify-between">
          <div><p className="text-sm text-muted-foreground">Imagens</p><p className="text-2xl font-bold">{images.length}</p></div>
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center justify-between">
          <div><p className="text-sm text-muted-foreground">Redes</p><p className="text-2xl font-bold">{networks.length}</p></div>
          <Network className="h-8 w-8 text-muted-foreground" />
        </CardContent></Card>
      </div>

      <Tabs defaultValue="containers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="containers">Containers</TabsTrigger>
          <TabsTrigger value="images">Imagens</TabsTrigger>
          <TabsTrigger value="volumes">Volumes</TabsTrigger>
          <TabsTrigger value="networks">Redes</TabsTrigger>
        </TabsList>

        <TabsContent value="containers" className="space-y-4">
          <Input placeholder="Filtrar..." className="max-w-sm" value={searchContainer} onChange={e => setSearchContainer(e.target.value)} />
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome / Imagem</TableHead><TableHead>Status</TableHead><TableHead>Portas</TableHead><TableHead>Recursos</TableHead><TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {containers.filter(c => c.name.includes(searchContainer)).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.image}</div>
                    </TableCell>
                    <TableCell><Badge className={statusConfig[c.status]?.className}>{statusConfig[c.status]?.label}</Badge></TableCell>
                    <TableCell className="text-xs">{formatPorts(c.ports)}</TableCell>
                    <TableCell className="text-xs">CPU: {c.cpu}% | RAM: {c.memory.percent}%</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleContainerAction(c.id, c.status === 'running' ? 'stop' : 'start')}>
                            {c.status === 'running' ? <Square className="mr-2 h-4 w-4"/> : <Play className="mr-2 h-4 w-4"/>}
                            {c.status === 'running' ? 'Parar' : 'Iniciar'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {setSelectedContainer(c); setShowLogs(true)}}><FileText className="mr-2 h-4 w-4"/>Logs</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => handleContainerAction(c.id, 'remove')}><Trash2 className="mr-2 h-4 w-4"/>Remover</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="images" className="space-y-4">
          <div className="flex gap-2 max-w-xl">
            <Input placeholder="Imagem (ex: alpine)..." value={newImageName} onChange={e => setNewImageName(e.target.value)} />
            <Button onClick={handlePullImage} disabled={isPulling}><Download className="h-4 w-4 mr-2"/>Pull</Button>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Repositório</TableHead><TableHead>Tag</TableHead><TableHead>Tamanho</TableHead><TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {images.map(img => (
                  <TableRow key={img.id}>
                    <TableCell className="font-medium">{img.repository}</TableCell>
                    <TableCell><Badge variant="outline">{img.tag}</Badge></TableCell>
                    <TableCell>{formatBytes(img.size)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeImageAction(img.id).then(() => loadImages(true))}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="volumes" className="space-y-4">
          <Button size="sm" onClick={handleCreateVolume}><Plus className="h-4 w-4 mr-2"/>Criar Volume</Button>
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Driver</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {volumes.map(v => (
                  <TableRow key={v.name}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell>{v.driver}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeVolumeAction(v.name).then(() => loadVolumes(true))}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="networks" className="space-y-4">
          <div className="flex items-center justify-between">
            <Input placeholder="Filtrar..." className="max-w-sm" value={searchNetwork} onChange={e => setSearchNetwork(e.target.value)} />
            
            {/* Modal de Criação de Rede integrado aqui */}
            <Dialog open={showCreateNetworkDialog} onOpenChange={setShowCreateNetworkDialog}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nova Rede</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Nova Rede Docker</DialogTitle>
                  <DialogDescription>
                    Configure uma rede isolada para seus containers.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="net-name">Nome da Rede</Label>
                    <Input 
                      id="net-name" 
                      placeholder="ex: rede-privada" 
                      value={newNetworkName}
                      onChange={(e) => setNewNetworkName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="driver">Driver</Label>
                    <select 
                      id="driver"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      value={newNetworkDriver}
                      onChange={(e) => setNewNetworkDriver(e.target.value)}
                    >
                      <option value="bridge">Bridge (Padrão)</option>
                      <option value="host">Host</option>
                      <option value="macvlan">Macvlan</option>
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="subnet">Sub-rede (CIDR)</Label>
                    <Input 
                      id="subnet" 
                      placeholder="ex: 192.168.10.0/24" 
                      value={newNetworkSubnet}
                      onChange={(e) => setNewNetworkSubnet(e.target.value)}
                    />
                    <p className="text-[0.75rem] text-muted-foreground">
                      Obrigatório incluir a máscara (ex: /24).
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreateNetworkDialog(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateNetwork} disabled={isCreatingNetwork}>
                    {isCreatingNetwork ? "Criando..." : "Criar Rede"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome</TableHead><TableHead>Faixa de IP (Subnet)</TableHead><TableHead>Driver</TableHead><TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {networks.filter(n => n.name.includes(searchNetwork)).map(n => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.name}</TableCell>
                    <TableCell><code className="text-xs bg-muted p-1 rounded text-primary">{n.subnet}</code></TableCell>
                    <TableCell>{n.driver}</TableCell>
                    <TableCell className="text-right">
                      {!['bridge', 'host', 'none'].includes(n.name) && (
                        <Button variant="ghost" size="icon" onClick={() => removeNetworkAction(n.id).then(() => loadNetworks(true))}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Logs - {selectedContainer?.name}</DialogTitle></DialogHeader>
          <ScrollArea className="h-96 w-full rounded border bg-black p-4">
            <pre className="text-xs font-mono text-green-500">
              {`[SISTEMA] docker logs ${selectedContainer?.name}`}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}