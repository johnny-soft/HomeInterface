'use client'

import { useState, useEffect, useRef } from 'react'
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
  Edit,
  TerminalSquare // <-- Novo Ícone do Terminal
} from 'lucide-react'
import { cn } from '@/lib/utils'

import { 
  fetchContainersAction, startContainerAction, stopContainerAction, restartContainerAction, removeContainerAction, createContainerAction, createComposeAction, fetchContainerLogsAction, inspectContainerAction,
  executeContainerCommandAction, // <-- Nova Função do Terminal
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
  
  // LOGS (Tempo Real via SSE)
  const [showLogs, setShowLogs] = useState(false)
  const [logLines, setLogLines] = useState<string[]>([])
  const logsEndRef = useRef<HTMLDivElement>(null)

  // TERMINAL INTERATIVO
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalHistory, setTerminalHistory] = useState<{type: 'in' | 'out' | 'sys', text: string}[]>([])
  const [terminalInput, setTerminalInput] = useState('')
  const [isTerminalRunning, setIsTerminalRunning] = useState(false)
  const terminalEndRef = useRef<HTMLDivElement>(null)

  // MODAIS DE CRIAÇÃO/EDIÇÃO
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editContainerId, setEditContainerId] = useState('')
  
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [creationTab, setCreationTab] = useState('standard')
  const [isCreating, setIsCreating] = useState(false)

  const [newContainerName, setNewContainerName] = useState('')
  const [newContainerImage, setNewContainerImage] = useState('')
  const [newContainerPorts, setNewContainerPorts] = useState('')
  const [newContainerEnvs, setNewContainerEnvs] = useState('')
  const [newContainerNetwork, setNewContainerNetwork] = useState('')
  const [newContainerIp, setNewContainerIp] = useState('')

  const [composeProjectName, setComposeProjectName] = useState('')
  const [composeYaml, setComposeYaml] = useState('')

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
    const interval = setInterval(() => refreshAll(true), 5000)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll para os Logs
  useEffect(() => {
    if (showLogs) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logLines, showLogs])

  // Auto-scroll para o Terminal
  useEffect(() => {
    if (showTerminal) terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalHistory, showTerminal])

  // Efeito do Stream de Logs
  useEffect(() => {
    let eventSource: EventSource | null = null;
    if (showLogs && selectedContainer) {
      setLogLines(['[SISTEMA] Conectando ao log stream...', `[SISTEMA] Lendo logs de: ${selectedContainer.name}`]);
      eventSource = new EventSource(`/api/docker/logs?id=${selectedContainer.id}`);
      eventSource.onmessage = (event) => {
        setLogLines(prev => {
          const newLines = [...prev, event.data];
          return newLines.length > 1000 ? newLines.slice(newLines.length - 1000) : newLines;
        });
      };
      eventSource.onerror = () => {
        setLogLines(prev => [...prev, '[SISTEMA] Stream finalizado ou erro de conexão.']);
        eventSource?.close();
      };
    }
    return () => eventSource?.close();
  }, [showLogs, selectedContainer]);

  // --- AÇÕES DO TERMINAL ---
  const handleOpenTerminal = (container: any) => {
    setSelectedContainer(container)
    setTerminalHistory([
      { type: 'sys', text: `Conectado ao container: ${container.name}` },
      { type: 'sys', text: `Nota: Este é um Web Shell. Comandos iterativos (nano, top) não são suportados.` },
      { type: 'sys', text: `-------------------------------------------------------------------------` }
    ])
    setTerminalInput('')
    setShowTerminal(true)
  }

  const handleTerminalSubmit = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && terminalInput.trim() && !isTerminalRunning) {
      const cmd = terminalInput.trim();
      setTerminalInput('');
      setTerminalHistory(prev => [...prev, { type: 'in', text: `root@${selectedContainer?.id.slice(0, 12)}:/# ${cmd}` }]);
      setIsTerminalRunning(true);

      if (cmd === 'clear') {
        setTerminalHistory([]);
        setIsTerminalRunning(false);
        return;
      }

      const res = await executeContainerCommandAction(selectedContainer.id, cmd);

      setTerminalHistory(prev => [...prev, {
        type: res.success ? 'out' : 'sys',
        text: res.output || (res.success ? '' : 'O comando retornou um erro sem saída.')
      }]);
      
      setIsTerminalRunning(false);
    }
  }

  // --- AÇÕES GERAIS DE CONTAINERS ---
  const handleContainerAction = async (id: string, action: 'start' | 'stop' | 'restart' | 'remove') => {
    try {
      if (action === 'start') await startContainerAction(id)
      else if (action === 'stop') await stopContainerAction(id)
      else if (action === 'restart') await restartContainerAction(id)
      else if (action === 'remove' && confirm("Remover container? Isso não apaga seus volumes.")) await removeContainerAction(id)
      loadContainers(true)
    } catch (e) { alert("Erro na ação do container") }
  }

  const handleOpenLogs = (container: any) => {
    setSelectedContainer(container)
    setLogLines([])
    setShowLogs(true)
  }

  const handleOpenEdit = async (container: any) => {
    setEditContainerId(container.id)
    setShowEditDialog(true)
    setNewContainerName('Carregando...')
    
    try {
      const details = await inspectContainerAction(container.id)
      setNewContainerName(details.name)
      setNewContainerImage(details.image)
      setNewContainerPorts(details.ports)
      setNewContainerEnvs(details.envs)
      setNewContainerNetwork(details.network)
      setNewContainerIp(details.ip)
    } catch (e: any) {
      alert("Falha ao carregar detalhes: " + e.message)
      setShowEditDialog(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!newContainerImage) return
    setIsCreating(true)
    try {
      await stopContainerAction(editContainerId)
      await removeContainerAction(editContainerId)
      await createContainerAction(newContainerName, newContainerImage, newContainerPorts, newContainerEnvs, newContainerNetwork, newContainerIp)
      setShowEditDialog(false)
      loadContainers(true)
    } catch (error: any) { alert("Erro ao recriar: " + error.message) } 
    finally { setIsCreating(false) }
  }

  const handleCreateContainer = async () => {
    if (!newContainerImage) return
    setIsCreating(true)
    try {
      await createContainerAction(newContainerName, newContainerImage, newContainerPorts, newContainerEnvs, newContainerNetwork, newContainerIp)
      setNewContainerName(''); setNewContainerImage(''); setNewContainerPorts(''); 
      setNewContainerEnvs(''); setNewContainerNetwork(''); setNewContainerIp('');
      setShowCreateDialog(false)
      loadContainers(true)
    } catch (error: any) { alert(error.message) } 
    finally { setIsCreating(false) }
  }

  const handleCreateCompose = async () => {
    if (!composeYaml) return
    setIsCreating(true)
    try {
      await createComposeAction(composeProjectName, composeYaml)
      setComposeProjectName('')
      setComposeYaml('')
      setShowCreateDialog(false)
      loadContainers(true); loadNetworks(true); loadVolumes(true)
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

  const handleCreateNetwork = async () => {
    if (!newNetworkName) return
    if (!newNetworkSubnet) return alert("A faixa de IP é obrigatória (ex: 192.168.10.0/24).")
    
    setIsCreatingNetwork(true)
    try {
      await createNetworkAction(newNetworkName.trim(), newNetworkDriver, newNetworkSubnet.trim())
      setNewNetworkName(''); setNewNetworkSubnet(''); setNewNetworkDriver('bridge')
      setShowCreateNetworkDialog(false)
      loadNetworks(true)
    } catch (error: any) { alert(error.message || "Erro ao criar rede") } 
    finally { setIsCreatingNetwork(false) }
  }

  const openNewContainerModal = () => {
    setNewContainerName(''); setNewContainerImage(''); setNewContainerPorts(''); 
    setNewContainerEnvs(''); setNewContainerNetwork(''); setNewContainerIp('');
    setShowCreateDialog(true)
  }

  // --- RENDERIZAÇÃO ---
  return (
    <div className="space-y-6">
      
      {/* HEADER E AÇÕES GLOBAIS */}
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
          
          <Button size="sm" onClick={openNewContainerModal}>
            <Plus className="mr-2 h-4 w-4" /> Novo Serviço
          </Button>

          {/* MODAL DE CRIAÇÃO (Padrão ou Compose) */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Implantar Serviço</DialogTitle>
                <DialogDescription>Inicie um único container ou levante uma stack completa usando Docker Compose.</DialogDescription>
              </DialogHeader>
              
              <Tabs value={creationTab} onValueChange={setCreationTab} className="mt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="standard">Container Padrão</TabsTrigger>
                  <TabsTrigger value="compose">Docker Compose</TabsTrigger>
                </TabsList>
                
                <TabsContent value="standard">
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2"><Label>Nome</Label><Input value={newContainerName} onChange={e => setNewContainerName(e.target.value)} /></div>
                      <div className="grid gap-2"><Label>Imagem *</Label><Input placeholder="ex: nginx:latest" value={newContainerImage} onChange={e => setNewContainerImage(e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Rede e Faixa de IP</Label>
                        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newContainerNetwork} onChange={e => setNewContainerNetwork(e.target.value)}>
                          <option value="">Padrão (Bridge)</option>
                          {networks.map(n => <option key={n.id} value={n.name}>{n.name} — {n.subnet}</option>)}
                        </select>
                      </div>
                      <div className="grid gap-2"><Label>IP Estático</Label><Input placeholder="ex: 192.168.50.10" value={newContainerIp} onChange={e => setNewContainerIp(e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2"><Label>Portas (ex: 80:80)</Label><Input value={newContainerPorts} onChange={e => setNewContainerPorts(e.target.value)} /></div>
                      <div className="grid gap-2"><Label>Variáveis de Env</Label><Input placeholder="KEY=VAL, KEY2=VAL2" value={newContainerEnvs} onChange={e => setNewContainerEnvs(e.target.value)} /></div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="compose">
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2"><Label>Nome do Projeto</Label><Input value={composeProjectName} onChange={e => setComposeProjectName(e.target.value)} /></div>
                    <div className="grid gap-2">
                      <Label>Conteúdo do docker-compose.yml *</Label>
                      <textarea
                        className="flex min-h-[250px] font-mono text-xs w-full rounded-md border border-input bg-background px-3 py-2"
                        placeholder={`version: "3.8"\nservices:\n  web:\n    image: nginx:alpine`}
                        value={composeYaml}
                        onChange={e => setComposeYaml(e.target.value)}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              
              <DialogFooter>
                {creationTab === 'standard' ? (
                  <Button onClick={handleCreateContainer} disabled={isCreating || !newContainerImage}>{isCreating ? "Criando..." : "Criar Container"}</Button>
                ) : (
                  <Button onClick={handleCreateCompose} disabled={isCreating || !composeYaml}>{isCreating ? "Implantando..." : "Deploy Compose"}</Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* MODAL DE EDIÇÃO */}
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Editar Configurações</DialogTitle>
                <DialogDescription>O container será recriado automaticamente para aplicar as mudanças.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2"><Label>Nome</Label><Input value={newContainerName} onChange={e => setNewContainerName(e.target.value)} /></div>
                  <div className="grid gap-2"><Label>Imagem</Label><Input value={newContainerImage} onChange={e => setNewContainerImage(e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Rede</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newContainerNetwork} onChange={e => setNewContainerNetwork(e.target.value)}>
                      <option value="">Padrão (Bridge)</option>
                      {networks.map(n => <option key={n.id} value={n.name}>{n.name} — {n.subnet}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-2"><Label>IP Estático</Label><Input value={newContainerIp} onChange={e => setNewContainerIp(e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2"><Label>Portas (ex: 80:80)</Label><Input value={newContainerPorts} onChange={e => setNewContainerPorts(e.target.value)} /></div>
                  <div className="grid gap-2"><Label>Variáveis de Env</Label><Input value={newContainerEnvs} onChange={e => setNewContainerEnvs(e.target.value)} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
                <Button onClick={handleSaveEdit} disabled={isCreating || !newContainerImage}>{isCreating ? "Aplicando..." : "Salvar e Reiniciar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>
      </div>

      {/* DASHBOARD CARDS */}
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

      {/* TABS DE GERENCIAMENTO */}
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
                    <TableCell className="text-xs">CPU: {c.cpu}% | RAM: {c.memory?.percent || 0}%</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleContainerAction(c.id, c.status === 'running' ? 'stop' : 'start')}>
                            {c.status === 'running' ? <Square className="mr-2 h-4 w-4"/> : <Play className="mr-2 h-4 w-4"/>}
                            {c.status === 'running' ? 'Parar' : 'Iniciar'}
                          </DropdownMenuItem>
                          
                          {/* AÇÕES NOVAS ADICIONADAS AQUI */}
                          {c.status === 'running' && (
                            <DropdownMenuItem onClick={() => handleOpenTerminal(c)}>
                              <TerminalSquare className="mr-2 h-4 w-4 text-primary"/> Terminal (Shell)
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleOpenEdit(c)}><Edit className="mr-2 h-4 w-4"/>Editar Config</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenLogs(c)}><FileText className="mr-2 h-4 w-4"/>Ver Logs</DropdownMenuItem>
                          
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

        {/* RESTANTE DAS ABAS (Imagens, Volumes, Networks) */}
        <TabsContent value="images" className="space-y-4">
          <div className="flex gap-2 max-w-xl">
            <Input placeholder="Imagem (ex: alpine)..." value={newImageName} onChange={e => setNewImageName(e.target.value)} />
            <Button onClick={handlePullImage} disabled={isPulling}><Download className="h-4 w-4 mr-2"/>Pull</Button>
          </div>
          <Card><Table><TableHeader><TableRow><TableHead>Repositório</TableHead><TableHead>Tag</TableHead><TableHead>Tamanho</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>
            {images.map(img => (
              <TableRow key={img.id}><TableCell className="font-medium">{img.repository}</TableCell><TableCell><Badge variant="outline">{img.tag}</Badge></TableCell><TableCell>{formatBytes(img.size)}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => removeImageAction(img.id).then(() => loadImages(true))}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell></TableRow>
            ))}
          </TableBody></Table></Card>
        </TabsContent>

        <TabsContent value="volumes" className="space-y-4">
          <Button size="sm" onClick={handleCreateVolume}><Plus className="h-4 w-4 mr-2"/>Criar Volume</Button>
          <Card><Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Driver</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>
            {volumes.map(v => (
              <TableRow key={v.name}><TableCell className="font-medium">{v.name}</TableCell><TableCell>{v.driver}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => removeVolumeAction(v.name).then(() => loadVolumes(true))}><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell></TableRow>
            ))}
          </TableBody></Table></Card>
        </TabsContent>

        <TabsContent value="networks" className="space-y-4">
          <div className="flex items-center justify-between">
            <Input placeholder="Filtrar..." className="max-w-sm" value={searchNetwork} onChange={e => setSearchNetwork(e.target.value)} />
            <Dialog open={showCreateNetworkDialog} onOpenChange={setShowCreateNetworkDialog}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nova Rede</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Criar Nova Rede Docker</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2"><Label>Nome</Label><Input value={newNetworkName} onChange={e => setNewNetworkName(e.target.value)}/></div>
                  <div className="grid gap-2">
                    <Label>Driver</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newNetworkDriver} onChange={e => setNewNetworkDriver(e.target.value)}>
                      <option value="bridge">Bridge</option><option value="host">Host</option><option value="macvlan">Macvlan</option>
                    </select>
                  </div>
                  <div className="grid gap-2"><Label>Sub-rede (CIDR)</Label><Input placeholder="192.168.10.0/24" value={newNetworkSubnet} onChange={e => setNewNetworkSubnet(e.target.value)}/></div>
                </div>
                <DialogFooter><Button onClick={handleCreateNetwork} disabled={isCreatingNetwork}>Criar Rede</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Card><Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Faixa de IP (Subnet)</TableHead><TableHead>Driver</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>
            {networks.filter(n => n.name.includes(searchNetwork)).map(n => (
              <TableRow key={n.id}>
                <TableCell className="font-medium">{n.name}</TableCell><TableCell><code className="text-xs bg-muted p-1 rounded">{n.subnet}</code></TableCell><TableCell>{n.driver}</TableCell>
                <TableCell className="text-right">{!['bridge', 'host', 'none'].includes(n.name) && <Button variant="ghost" size="icon" onClick={() => removeNetworkAction(n.id).then(() => loadNetworks(true))}><Trash2 className="h-4 w-4 text-destructive"/></Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table></Card>
        </TabsContent>
      </Tabs>

      {/* MODAL DE LOGS EM TEMPO REAL (STREAM) */}
      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Logs ao vivo - {selectedContainer?.name}</DialogTitle></DialogHeader>
          <ScrollArea className="h-[600px] w-full rounded-md border border-slate-700 bg-[#0c0c0c] p-4">
            <div className="flex flex-col gap-1 font-mono text-xs sm:text-sm text-green-400">
              {logLines.length === 0 ? <span className="text-slate-500">Aguardando logs...</span> : logLines.map((line, index) => <span key={index} className="break-all whitespace-pre-wrap">{line}</span>)}
            </div>
            <div ref={logsEndRef} style={{ float:"left", clear: "both" }}></div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* MODAL DO TERMINAL WEB SHELL */}
      <Dialog open={showTerminal} onOpenChange={setShowTerminal}>
        <DialogContent className="max-w-4xl bg-black border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <TerminalSquare className="h-5 w-5" /> Shell - {selectedContainer?.name}
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="h-[500px] w-full rounded p-4 text-green-400 font-mono text-sm" onClick={() => document.getElementById('terminal-input')?.focus()}>
            <div className="flex flex-col pb-2">
              {terminalHistory.map((line, i) => (
                <div key={i} className={cn("whitespace-pre-wrap break-all", line.type === 'sys' && "text-blue-400", line.type === 'out' && "text-slate-300")}>
                  {line.text}
                </div>
              ))}
              
              <div className="flex mt-2 items-center">
                <span className="mr-2 select-none text-green-500">{`root@${selectedContainer?.id.slice(0, 12)}:/#`}</span>
                <input 
                  id="terminal-input"
                  className="flex-1 bg-transparent border-none outline-none text-green-400 focus:ring-0 p-0"
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  onKeyDown={handleTerminalSubmit}
                  disabled={isTerminalRunning}
                  autoComplete="off"
                  spellCheck="false"
                  autoFocus
                />
              </div>
            </div>
            <div ref={terminalEndRef}></div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      
    </div>
  )
}