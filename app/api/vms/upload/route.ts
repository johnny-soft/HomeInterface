import { NextRequest, NextResponse } from 'next/server'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import path from 'path'
import { mkdir } from 'fs/promises'

// Configurações para o Next.js não interromper o upload
export const maxDuration = 900; // 15 minutos para ISOs grandes
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Pegamos o nome do arquivo enviado pelo Header customizado
    const fileName = req.headers.get('x-file-name') || `iso-${Date.now()}.iso`;
    const uploadDir = '/var/lib/libvirt/images';

    // Garante que o diretório existe
    await mkdir(uploadDir, { recursive: true });
    
    const filePath = path.join(uploadDir, fileName);

    if (!req.body) {
      return NextResponse.json({ error: 'Corpo da requisição vazio' }, { status: 400 });
    }

    // Criamos o "cano" (stream) para o arquivo no disco
    const writer = createWriteStream(filePath);
    
    // O pipeline lê do request e escreve no disco sem carregar o arquivo na RAM
    // O cast para any é necessário pois o tipo do Web Stream difere levemente do Node Stream aqui
    await pipeline(req.body as any, writer);

    return NextResponse.json({ 
      success: true, 
      path: filePath,
      name: fileName 
    });
  } catch (error: any) {
    console.error('Erro no Stream Upload:', error);
    return NextResponse.json({ error: 'Erro no servidor: ' + error.message }, { status: 500 });
  }
}