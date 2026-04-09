'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Shield, ShieldCheck, ShieldOff, Plus, Search, RefreshCw, Trash2, ArrowRight, Check, X, Ban, Network, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

// Importação das Server Actions
import { 
  fetchFirewallDataAction, 
  toggleFirewallAction, 
  addFirewallRuleAction, 
  deleteFirewallRuleAction 
} from './actions'

// Configurações visuais de Status
const actionConfig = {
  ALLOW: { label: 'Aceitar', className: 'bg-success/20 text-success', icon: Check },
  DENY: { label: 'Descartar', className: 'bg-destructive/20 text-destructive', icon: X },
  REJECT: { label: 'Rejeitar', className: 'bg-warning/20 text-warning', icon: Ban },
}

// Mocks para funcionalidades futuras (Port Forward e Blacklist)
const demoPortForwards = [
  { id: 'pf-1', externalPort: 8080, internalIP: '192.168.122.10', internalPort: 80, protocol: 'tcp', enabled: true, description: 'Web Server VM' },
  { id: 'pf-2', externalPort: 3389, internalIP: '192.168.122.20', internalPort: 3389, protocol: 'tcp', enabled: true, description: 'Windows RDP' },
]

const demoBlacklist = [
  { ip: '10.0.0.100', reason: 'Tentativa de brute force', addedAt: '2024-03-28 14:30' },
  { ip: '203.0.113.50', reason: 'Scan de portas', addedAt: '2024-03-20 22:45' },
]

export default function FirewallPage() {
  // --- ESTADOS DE DADOS ---
  const [data, setData] = useState({ active: false, rules: [] as any[] })
  const [loading, setLoading] = useState(true)
  
  // --- ESTADOS DE UI / CARREGAMENTO ---
  const [isTogglingMaster, setIsTogglingMaster] = useState(false)
  const [isSavingRule, setIsSavingRule] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // --- CONTROLE DE MODAIS ---
  const [showRuleDialog, setShowRuleDialog] = useState(false)
  const [showPortForwardDialog, setShowPortForwardDialog] = useState(false)
  const [showBlacklistDialog, setShowBlacklistDialog] = useState(false)

  // --- FORMULÁRIO DE NOVA REGRA ---
  const [ruleForm, setRuleForm] = useState({ port: '', protocol: 'tcp', action: 'allow' })

  // --- FUNÇÃO DE CARREGAMENTO ---
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const result = await fetchFirewallDataAction()
      setData(result)
    } catch (error) {
      console.error("Erro ao carregar dados do firewall")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // --- HANDLER: ATIVAR/DESATIVAR FIREWALL ---
const handleToggleMaster = async (checked: boolean) => {
  setIsTogglingMaster(true);
  try {
    // Tenta executar a ação
    await toggleFirewallAction(checked);
    
    // Aguarda o WSL processar (importante!)
    await new Promise(r => setTimeout(r, 800));
    
    // Recarrega os dados reais do sistema
    const updated = await fetchFirewallDataAction();
    setData(updated);
    
  } catch (e: any) {
    alert("Falha ao comunicar com o UFW. Verifique o sudoers.");
    // Força o switch a voltar para a posição real do console
    await loadData(true);
  } finally {
    setIsTogglingMaster(false);
  }
};

  // --- HANDLER: SALVAR NOVA REGRA (CORRIGIDO) ---
  const handleSaveRule = async () => {
    if (!ruleForm.port) {
      alert("Informe a porta ou serviço.")
      return
    }

    setIsSavingRule(true)
    try {
      await addFirewallRuleAction(ruleForm)
      setRuleForm({ port: '', protocol: 'tcp', action: 'allow' })
      setShowRuleDialog(false)
      await loadData(true)
    } catch (e: any) {
      alert("Erro ao criar regra: " + e.message)
    } finally {
      setIsSavingRule(false)
    }
  }

  // --- HANDLER: DELETAR REGRA ---
  const handleDeleteRule = async (id: number) => {
    if (!confirm(`Deseja remover a regra [${id}]?`)) return
    setDeletingId(id)
    try {
      await deleteFirewallRuleAction(id)
      await loadData(true)
    } catch (e: any) {
      alert("Erro ao excluir regra: " + e.message)
    } finally {
      setDeletingId(null)
    }
  }

  // --- CÁLCULOS DE INTERFACE ---
  const activeRulesCount = data.rules.length
  const blockedRulesCount = data.rules.filter(r => r.action === 'DENY' || r.action === 'REJECT').length
  
  const filteredRules = data.rules.filter(r => 
    r.to.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.from.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Firewall (UFW)</h1>
          <p className="text-muted-foreground">Gerencie a segurança e o tráfego do servidor</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status Global</span>
            <Switch 
              checked={data.active} 
              onCheckedChange={handleToggleMaster}
              disabled={isTogglingMaster || loading}
            />
            <Badge variant="secondary" className={data.active ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}>
              {data.active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadData()} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} /> Recarregar
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Segurança</p>
              <p className={cn("text-2xl font-bold", data.active ? "text-success" : "text-destructive")}>
                {data.active ? 'Protegido' : 'Vulnerável'}
              </p>
            </div>
            {data.active ? <ShieldCheck className="h-8 w-8 text-success" /> : <ShieldOff className="h-8 w-8 text-destructive" />}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Regras Ativas</p>
              <p className="text-2xl font-bold">{activeRulesCount}</p>
            </div>
            <Shield className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Bloqueios</p>
              <p className="text-2xl font-bold">{blockedRulesCount}</p>
            </div>
            <Ban className="h-8 w-8 text-destructive" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Redirecionamentos</p>
              <p className="text-2xl font-bold">{demoPortForwards.length}</p>
            </div>
            <Network className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="rules" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rules">Regras de Filtragem</TabsTrigger>
          <TabsTrigger value="portforward">Port Forwarding</TabsTrigger>
          <TabsTrigger value="blacklist">Blacklist</TabsTrigger>
        </TabsList>

        {/* Tab: Regras */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Buscar por porta ou IP..." 
                className="pl-9" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={!data.active}>
                  <Plus className="mr-2 h-4 w-4" /> Nova Regra
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Regra de Firewall</DialogTitle>
                  <DialogDescription>Defina permissões de tráfego para o servidor.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Porta / Serviço</Label>
                      <Input 
                        placeholder="Ex: 80, 443, 22" 
                        value={ruleForm.port} 
                        onChange={e => setRuleForm({...ruleForm, port: e.target.value})}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Protocolo</Label>
                      <Select value={ruleForm.protocol} onValueChange={v => setRuleForm({...ruleForm, protocol: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tcp">TCP</SelectItem>
                          <SelectItem value="udp">UDP</SelectItem>
                          <SelectItem value="any">Ambos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Ação</Label>
                    <Select value={ruleForm.action} onValueChange={v => setRuleForm({...ruleForm, action: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="allow">Aceitar (ALLOW)</SelectItem>
                        <SelectItem value="deny">Descartar (DENY)</SelectItem>
                        <SelectItem value="reject">Rejeitar (REJECT)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowRuleDialog(false)}>Cancelar</Button>
                  <Button onClick={handleSaveRule} disabled={isSavingRule}>
                    {isSavingRule ? "Processando..." : "Criar Regra"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-center">ID</TableHead>
                  <TableHead>Destino (Porta)</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data.active ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      O Firewall está desativado no sistema.
                    </TableCell>
                  </TableRow>
                ) : filteredRules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      Nenhuma regra encontrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRules.map((rule) => {
                    const actionKey = rule.action as keyof typeof actionConfig;
                    const Icon = actionConfig[actionKey]?.icon || Check;
                    return (
                      <TableRow key={rule.id}>
                        <TableCell className="text-center font-mono text-muted-foreground">[{rule.id}]</TableCell>
                        <TableCell>
                          <code className="bg-muted px-2 py-1 rounded text-xs font-bold">{rule.to}</code>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn("gap-1", actionConfig[actionKey]?.className)}>
                            <Icon className="h-3 w-3" />
                            {actionConfig[actionKey]?.label || rule.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{rule.from}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDeleteRule(rule.id)}
                            disabled={deletingId === rule.id}
                          >
                            <Trash2 className={cn("h-4 w-4 text-destructive", deletingId === rule.id && "opacity-50")} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Tab: Port Forward (Placeholder) */}
        <TabsContent value="portforward">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Externa</TableHead>
                  <TableHead></TableHead>
                  <TableHead>Destino Interno</TableHead>
                  <TableHead className="text-right text-xs text-muted-foreground italic">Somente Leitura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {demoPortForwards.map(pf => (
                  <TableRow key={pf.id}>
                    <TableCell className="font-medium">{pf.description}</TableCell>
                    <TableCell><Globe className="inline h-3 w-3 mr-1"/>{pf.externalPort}</TableCell>
                    <TableCell><ArrowRight className="h-4 w-4 text-muted-foreground"/></TableCell>
                    <TableCell><code className="text-xs">{pf.internalIP}:{pf.internalPort}</code></TableCell>
                    <TableCell className="text-right">
                       <Badge variant="outline">Ativo</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Tab: Blacklist (Placeholder) */}
        <TabsContent value="blacklist">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP Bloqueado</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {demoBlacklist.map((b, i) => (
                  <TableRow key={i}>
                    <TableCell><code className="text-destructive font-bold">{b.ip}</code></TableCell>
                    <TableCell className="text-sm">{b.reason}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.addedAt}</TableCell>
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