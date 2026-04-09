'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { fetchUsersAction } from '../(dashboard)/settings/actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { login } = useAuth()
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const users = await fetchUsersAction()
    const found = users.find((u: any) => u.username === username && u.password === password)

    if (found) {
      login(found.username, found.role)
      router.push('/')
    } else {
      alert("Credenciais Inválidas")
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Card className="w-96 border-border shadow-lg">
        <CardHeader><CardTitle className="text-center font-bold">HomeLab Manager v3.1</CardTitle></CardHeader>
        <form onSubmit={handleLogin} className="space-y-4 p-6">
          <Input placeholder="Usuário" value={username} onChange={e => setUsername(e.target.value)} />
          <Input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} />
          <Button type="submit" className="w-full font-bold">ENTRAR</Button>
        </form>
      </Card>
    </div>
  )
}