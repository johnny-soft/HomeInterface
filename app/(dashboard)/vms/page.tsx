'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Play, Square, RotateCcw, Trash2, MoreVertical, Plus, Monitor, RefreshCw, Power, Terminal, Cpu, MemoryStick, Network, Upload, FileCode } from 'lucide-react'
import { cn } from '@/lib/utils'

import { fetchVMsAction, vmPowerAction, createVMAction, removeVMAction, fetchISOsAction } from './actions'

export default function VMsPage() {
  const [vms, setVMs] = useState<any[]>([])
  const [isos, setIsos] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  
  // Form
  const [newName, setNewName] = useState('')
  const [newIP, setNewIP] = useState('')
  const [newRam, setNewRam] = useState([2048])
  const [newCPUs, setNewCPUs] = useState([2])
  const [newDisk, setNewDisk] = useState([30])
  const [selectedISO, setSelectedISO] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Upload
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const load = async (silent = false) => {
    if (!silent) setIsLoading(true)
    const [v, i] = await Promise.all([fetchVMsAction(), fetchISOsAction()])
    setVMs(v); setIsos(i); setIsLoading(false)
  }

  useEffect(() => { 
    load()
    const interval = setInterval(() => load(true), 5000)
    return () => clearInterval(interval) 
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadProgress(10)
    try {
      const res = await fetch('/api/vms/upload', {
        method: 'POST',
        body: file,
        headers: { 'x-file-name': encodeURIComponent(file.name) }
      })
      if (!res.ok) throw new Error('Falha no upload')
      const data = await res.json()
      setUploadProgress(100); setSelectedISO(data.path); await load(true)
    } catch (err) { alert("Erro ao subir ISO") } finally {
      setUploading(false); setTimeout(() => setUploadProgress(0), 2000)
    }
  }

  const handleAction = async (name: string, act: string) => {
    await vmPowerAction(name, act); load(true)
  }

  const handleDelete = async (name: string) => {
    if (confirm(`Excluir permanentemente a VM ${name}?`)) {
      await removeVMAction(name); load(true)
    }
  }

  const handleCreate = async () => {
    if (!newName) return
    setIsCreating(true)
    try {
      const result = await createVMAction({ name: newName, ram: newRam[0], vcpus: newCPUs[0], disk: newDisk[0], iso: selectedISO, ip: newIP })
      if (result.success) { setShowCreate(false); setNewName(''); setNewIP(''); setSelectedISO(''); load(true) }
    } catch (e: any) { alert("Erro: " + e.message) } finally { setIsCreating(false) }
  }

  const openVnc = (name: string) => {
    // O Websockify em modo token espera o parâmetro path ou token na URL
    const url = `http://${window.location.hostname}:6080/vnc.html?path=vnc?token=${name}&host=${window.location.hostname}&port=6080&encrypt=0&resize=scale`
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Máquinas Virtuais</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load()} disabled={isLoading}><RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} /></Button>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" /> Nova VM</Button></DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader><DialogTitle>Criar Máquina Virtual</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2"><Label>Nome</Label><Input value={newName} onChange={e => setNewName(e.target.value)} /></div>
                  <div className="grid gap-2"><Label>IP Estático</Label><Input value={newIP} onChange={e => setNewIP(e.target.value)} placeholder="192.168.122.x" /></div>
                </div>
                <div className="space-y-3 p-4 border rounded-lg bg-muted/20">
                  <Label className="flex items-center gap-2"><FileCode className="h-4 w-4" /> ISO</Label>
                  <Select value={selectedISO} onValueChange={setSelectedISO}>
                    <SelectTrigger><SelectValue placeholder="Selecione ou carregue abaixo" /></SelectTrigger>
                    <SelectContent>{isos.map(i => <SelectItem key={i.path} value={i.path}>{i.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="relative border-2 border-dashed rounded p-3 text-center hover:bg-muted/50 transition-colors">
                    <Input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} disabled={uploading} />
                    <Upload className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-[10px] text-muted-foreground">Upload de nova ISO</p>
                    {uploadProgress > 0 && <Progress value={uploadProgress} className="h-1 mt-2" />}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-6 pt-2">
                  <div className="space-y-2"><Label className="text-[10px] uppercase">RAM: {newRam[0]}MB</Label><Slider value={newRam} onValueChange={setNewRam} min={512} max={16384} step={512} /></div>
                  <div className="space-y-2"><Label className="text-[10px] uppercase">vCPU: {newCPUs[0]}</Label><Slider value={newCPUs} onValueChange={setNewCPUs} min={1} max={16} step={1} /></div>
                  <div className="space-y-2"><Label className="text-[10px] uppercase">Disco: {newDisk[0]}GB</Label><Slider value={newDisk} onValueChange={setNewDisk} min={10} max={500} step={10} /></div>
                </div>
              </div>
              <DialogFooter><Button onClick={handleCreate} disabled={isCreating || uploading}>{isCreating ? "Criando..." : "Criar"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {vms.map(vm => (
          <Card key={vm.name} className="relative overflow-hidden">
            <CardHeader className="pb-3 flex flex-row justify-between items-center space-y-0">
              <div className="flex items-center gap-2">
                <Monitor className={cn("h-4 w-4", vm.status === 'running' ? "text-success" : "text-muted-foreground")} />
                <CardTitle className="text-sm font-bold">{vm.name}</CardTitle>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4"/></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {vm.status !== 'running' ? (
                    <DropdownMenuItem onClick={() => handleAction(vm.name, 'start')}><Play className="h-4 w-4 mr-2 text-success fill-success"/> Ligar</DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => openVnc(vm.name)}><Terminal className="h-4 w-4 mr-2 text-primary"/> Console VNC</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleAction(vm.name, 'shutdown')}><Square className="h-4 w-4 mr-2"/> Desligar (Seguro)</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleAction(vm.name, 'reboot')}><RotateCcw className="h-4 w-4 mr-2"/> Reiniciar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleAction(vm.name, 'destroy')} className="text-warning"><Power className="h-4 w-4 mr-2"/> Forçar Parada</DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(vm.name)}><Trash2 className="h-4 w-4 mr-2"/> Excluir VM</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <Badge variant={vm.status === 'running' ? 'default' : 'secondary'} className="text-[10px] uppercase tracking-wider">{vm.status}</Badge>
                <span className="text-xs font-mono text-muted-foreground flex items-center gap-1"><Network className="h-3 w-3" /> {vm.ipAddress}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-[11px] border-t pt-3 text-muted-foreground">
                <div className="flex items-center gap-2"><Cpu className="h-3 w-3"/> {vm.vcpus} vCPUs</div>
                <div className="flex items-center gap-2"><MemoryStick className="h-3 w-3"/> {vm.memory} MB RAM</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}