'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Globe, Shield, Plus, Search, RefreshCw, Settings, Trash2, FileText, Check, X, Lock, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

// Actions Reais
import { 
  fetchNginxSitesAction, 
  reloadNginxAction, 
  createNginxSiteAction,
  fetchVhostContentAction,
  fetchLogContentAction 
} from './actions'

export default function WebServerPage() {
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isActionLoading, setIsActionLoading] = useState(false)

  // Estados dos Modais
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showInspectDialog, setShowInspectDialog] = useState(false)
  const [inspectData, setInspectData] = useState({ title: '', content: '' })
  
  // Estado do Formulário Novo Site
  const [newSite, setNewSite] = useState({ domain: '', php: false, phpVersion: '8.2' })

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    const data = await fetchNginxSitesAction()
    setSites(data)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // HANDLERS
  const handleReload = async () => {
    setIsActionLoading(true)
    try {
      await reloadNginxAction()
      alert("Nginx recarregado!")
    } catch (e: any) { alert(e.message) }
    finally { setIsActionLoading(false) }
  }

  const handleCreateSite = async () => {
    if (!newSite.domain) return alert("Informe o domínio")
    setIsActionLoading(true)
    try {
      await createNginxSiteAction(newSite)
      setShowCreateDialog(false)
      setNewSite({ domain: '', php: false, phpVersion: '8.2' })
      await loadData(true)
    } catch (e: any) { alert(e.message) }
    finally { setIsActionLoading(false) }
  }

  const handleViewLog = async (id: string) => {
    setIsActionLoading(true)
    try {
      const content = await fetchLogContentAction(id)
      setInspectData({ title: `Logs: ${id}`, content })
      setShowInspectDialog(true)
    } catch (e) { alert("Erro ao ler logs") }
    finally { setIsActionLoading(false) }
  }

  const handleEditConfig = async (id: string) => {
    setIsActionLoading(true)
    try {
      const content = await fetchVhostContentAction(id)
      setInspectData({ title: `Configuração: ${id}`, content })
      setShowInspectDialog(true)
    } catch (e) { alert("Erro ao ler config") }
    finally { setIsActionLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Web Server</h1>
          <p className="text-muted-foreground text-sm">Nginx no {sites.length > 0 ? 'Ubuntu/WSL' : 'Carregando...'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReload} disabled={isActionLoading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isActionLoading && "animate-spin")} /> Recarregar
          </Button>
          
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Novo Site</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Criar Site</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Domínio</Label>
                  <Input value={newSite.domain} onChange={e => setNewSite({...newSite, domain: e.target.value})} placeholder="ex: meusite.local" />
                </div>
                <div className="flex items-center justify-between">
                  <Label>PHP FPM</Label>
                  <Switch checked={newSite.php} onCheckedChange={v => setNewSite({...newSite, php: v})} />
                </div>
                {newSite.php && (
                  <div className="grid gap-2">
                    <Label>Versão PHP</Label>
                    <Input value={newSite.phpVersion} onChange={e => setNewSite({...newSite, phpVersion: e.target.value})} />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
                <Button onClick={handleCreateSite} disabled={isActionLoading}>Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4 flex items-center justify-between">
          <div><p className="text-xs text-muted-foreground uppercase">Sites</p><p className="text-2xl font-bold">{sites.length}</p></div>
          <Globe className="h-8 w-8 text-primary/40" />
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center justify-between">
          <div><p className="text-xs text-muted-foreground uppercase">Ativos</p><p className="text-2xl font-bold text-success">{sites.filter(s=>s.enabled).length}</p></div>
          <Check className="h-8 w-8 text-success/40" />
        </CardContent></Card>
      </div>

      <Tabs defaultValue="sites">
        <TabsList><TabsTrigger value="sites">Sites</TabsTrigger><TabsTrigger value="logs">Global Logs</TabsTrigger></TabsList>
        <TabsContent value="sites" className="grid gap-4 md:grid-cols-2 pt-4">
          {sites.map(site => (
            <Card key={site.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{site.name}</CardTitle>
                <Badge variant={site.enabled ? "default" : "secondary"}>{site.enabled ? 'Ativo' : 'Inativo'}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-xs text-muted-foreground font-mono truncate">{site.domain}</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleViewLog(site.id)}><FileText className="h-4 w-4 mr-2"/>Logs</Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEditConfig(site.id)}><Settings className="h-4 w-4 mr-2"/>Editar</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Modal de Inspeção de Texto (Logs/Config) */}
      <Dialog open={showInspectDialog} onOpenChange={setShowInspectDialog}>
        <DialogContent className="max-w-4xl h-[70vh] flex flex-col">
          <DialogHeader><DialogTitle>{inspectData.title}</DialogTitle></DialogHeader>
          <div className="flex-1 bg-black/90 rounded-md p-4 overflow-auto font-mono text-[11px] text-green-400">
            <pre className="whitespace-pre-wrap">{inspectData.content}</pre>
          </div>
          <DialogFooter><Button onClick={() => setShowInspectDialog(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}