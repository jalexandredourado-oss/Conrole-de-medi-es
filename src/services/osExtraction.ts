export interface ExtractedOsItem {
  item?: string;
  lote?: string;
  qtd?: number;
  unidade?: string;
  especificacao?: string;
  valorItem?: number;
}

export interface ExtractedOsData {
  numeroOs: string;
  descricao: string;
  valor: number;
  dataEmissao?: string;
  itens?: ExtractedOsItem[];
}

export interface ExtractOsResult {
  success: boolean;
  data?: ExtractedOsData;
  error?: string;
}

/**
 * Sends a base64 encoded image to the server API to extract Ordem de Serviço (OS) details using Gemini AI.
 */
export async function extractOsFromImage(
  imageBase64: string,
  mimeType: string = 'image/png'
): Promise<ExtractOsResult> {
  try {
    const response = await fetch('/api/os/extract-from-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64,
        mimeType,
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      throw new Error(errJson?.error || `Erro HTTP ${response.status} ao processar imagem.`);
    }

    const json = await response.json();
    if (!json.success || !json.data) {
      throw new Error(json.error || 'Não foi possível extrair os dados da OS da imagem.');
    }

    return {
      success: true,
      data: json.data,
    };
  } catch (err: any) {
    console.error('Falha na extração de OS:', err);
    return {
      success: false,
      error: err?.message || 'Erro inesperado ao conectar com o serviço de extração de OS.',
    };
  }
}

/**
 * Converts a File object to base64 data string.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsDataURL(file);
  });
}
