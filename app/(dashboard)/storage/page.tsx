'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Database, Plus, RefreshCw, Trash2, Check, AlertTriangle, ShieldCheck, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

import { 
  fetchDisksAction, 
  fetchPoolsAction, 
  createPoolAction, 
  createShareAction, 
  fetchSharesAction 
} from './actions'

export default function StoragePage() {
  const [disks, setDisks] = useState<any[]>([])
  const [pools, setPools] = useState<any[]>([])
  const [shares, setShares] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Modais Controlados
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  // Forms
  const [poolName, setPoolName] = useState('')
  const [raidLevel, setRaidLevel] = useState('mirror')
  const [selectedDisks, setSelectedDisks] = useState<string[]>([])
  const [autoSnap, setAutoSnap] = useState(true)

  const [shareName, setShareName] = useState('')
  const [sharePath, setSharePath] = useState('')
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    const [d, p, sh] = await Promise.all([fetchDisksAction(), fetchPoolsAction(), fetchSharesAction()])
    setDisks(d); setPools(p); setShares(sh); setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const handleCreateShare = async () => {
    if (!shareName || !sharePath) return
    setIsCreating(true)
    try {
      const res = await createShareAction({ name: shareName, path: sharePath, readOnly: isReadOnly })
      if (res.success) {
        setIsShareModalOpen(false)
        setShareName(''); setSharePath('')
        await loadData(true)
      }
    } catch (e: any) { alert(e.message) }
    finally { setIsCreating(false) }
  }

  const formatBytes = (b: number) => {
    if (b === 0) return '0 B'
    const i = Math.floor(Math.log(b) / Math.log(1024))
    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i]
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Storage / NAS</h1>
          <p className="text-muted-foreground text-sm">Gestão de ZFS, Discos e Samba</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadData()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Atualizar
        </Button>
      </div>

      <Tabs defaultValue="pools">
        <TabsList>
          <TabsTrigger value="pools">Pools ZFS</TabsTrigger>
          <TabsTrigger value="shares">Compartilhamentos</TabsTrigger>
          <TabsTrigger value="disks">Discos</TabsTrigger>
        </TabsList>

        <TabsContent value="pools" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={isPoolModalOpen} onOpenChange={setIsPoolModalOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2"/> Novo Pool</Button></DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader><DialogTitle>Criar Pool ZFS</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2"><Label>Nome</Label><Input value={poolName} onChange={e=>setPoolName(e.target.value)} placeholder="data-pool" /></div>
                  <div className="grid gap-2">
                    <Label>RAID</Label>
                    <Select value={raidLevel} onValueChange={setRaidLevel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stripe">Stripe (S. Redundância)</SelectItem>
                        <SelectItem value="mirror">Mirror (Espelhado)</SelectItem>
                        <SelectItem value="raidz">RAIDZ (Paridade)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Discos Disponíveis</Label>
                    <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-2">
                      {disks.filter(d => d.status === 'available').map(d => (
                        <div key={d.name} className="flex items-center gap-2 text-sm">
                          <Checkbox onCheckedChange={(checked) => setSelectedDisks(prev => checked ? [...prev, d.path] : prev.filter(p => p !== d.path))} />
                          <span>{d.name} ({formatBytes(d.size)}) - {d.model}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter><Button onClick={() => createPoolAction(poolName, raidLevel, selectedDisks, autoSnap).then(() => { setIsPoolModalOpen(false); loadData(true); })}>Criar Pool</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {pools.map(pool => (
              <Card key={pool.name}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-2"><Database className="h-5 w-5 text-primary"/><CardTitle className="text-sm font-bold">{pool.name}</CardTitle></div>
                  <Badge variant={pool.status === 'online' ? 'default' : 'destructive'}>{pool.status}</Badge>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="space-y-1"><div className="flex justify-between text-xs"><span>Uso: {formatBytes(pool.used)}</span><span>Total: {formatBytes(pool.size)}</span></div><Progress value={(pool.used / pool.size) * 100} className="h-2" /></div>
                  <div className="flex items-center gap-2 text-muted-foreground"><FolderOpen className="h-3 w-3"/><span>{pool.mountpoint}</span></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="shares" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" /> Novo Share</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Configurar Samba</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2"><Label>Nome na Rede</Label><Input value={shareName} onChange={e => setShareName(e.target.value)} placeholder="Publico" /></div>
                  <div className="grid gap-2">
                    <Label>Caminho da Pasta</Label>
                    <div className="flex gap-2">
                      <Input value={sharePath} onChange={e => setSharePath(e.target.value)} placeholder="/mnt/pool/dados" />
                      <Select onValueChange={setSharePath}>
                        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Pools" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="/home/homelab">Pasta Home</SelectItem>
                          {pools.map(p => <SelectItem key={p.name} value={p.mountpoint}>Pool: {p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2"><Checkbox id="ro" checked={isReadOnly} onCheckedChange={(c: any) => setIsReadOnly(c)} /><Label htmlFor="ro">Somente Leitura</Label></div>
                </div>
                <DialogFooter><Button onClick={handleCreateShare} disabled={isCreating}>{isCreating ? "Criando..." : "Criar Share"}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Caminho Local</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader>
              <TableBody>
                {shares.map(sh => (
                  <TableRow key={sh.name}>
                    <TableCell className="font-bold">{sh.name}</TableCell>
                    <TableCell className="font-mono text-xs">{sh.path}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive"/></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="disks" className="mt-4">
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Disco</TableHead><TableHead>Modelo</TableHead><TableHead>Saúde</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
              <TableBody>
                {disks.map(disk => (
                  <TableRow key={disk.name}>
                    <TableCell className="font-mono text-xs font-bold">{disk.path}</TableCell>
                    <TableCell className="text-xs">{disk.model}</TableCell>
                    <TableCell><Badge 
  variant="outline" 
  className={cn(
    disk.health === 'healthy' ? 'text-success border-success' : 
    disk.health === 'unsupported' ? 'text-muted-foreground border-muted opacity-50' : 
    'text-destructive border-destructive animate-pulse' // Só fica vermelho se for Warning real
  )}
>
  {disk.health === 'healthy' && <Check className="h-3 w-3 mr-1" />}
  {disk.health === 'unsupported' ? 'N/A' : disk.health.toUpperCase()}
</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{disk.status === 'available' ? 'Disponível' : 'Em Uso'}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}