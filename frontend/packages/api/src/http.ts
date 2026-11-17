/** Cliente HTTP mínimo que entende respostas application/problem+json (RFC 9457). */

export interface ErroDeCampo {
  campo: string;
  mensagem: string;
}

export class ErroDaApi extends Error {
  readonly status: number;
  readonly errosDeCampo: ErroDeCampo[];
  readonly correlationId: string | null;
  /** Corpo problem+json completo, com as extensões do serviço . */
  readonly corpo: Record<string, unknown>;

  constructor(status: number, mensagem: string, errosDeCampo: ErroDeCampo[], correlationId: string | null, corpo: Record<string, unknown> = {}) {
    super(mensagem);
    this.status = status;
    this.errosDeCampo = errosDeCampo;
    this.correlationId = correlationId;
    this.corpo = corpo;
  }

  mensagemDoCampo(campo: string): string | undefined {
    return this.errosDeCampo.find((erro) => erro.campo === campo)?.mensagem;
  }
}

export interface RespostaComRastreio<T> {
  dados: T;
  correlationId: string | null;
  duracaoMs: number;
}

export async function requisitar<T>(url: string, opcoes: RequestInit = {}): Promise<RespostaComRastreio<T>> {
  const inicio = performance.now();
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      ...opcoes,
      headers: { "content-type": "application/json", ...(opcoes.headers ?? {}) },
    });
  } catch {
    throw new ErroDaApi(0, `Não foi possível falar com ${url.split("/").slice(0, 3).join("/")}. Confira se o gateway e o serviço estão no ar.`, [], null);
  }
  const correlationId = resposta.headers.get("x-correlation-id");
  const corpo = resposta.status === 204 ? null : await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const mensagem = corpo?.detail ?? corpo?.title ?? `HTTP ${resposta.status}`;
    throw new ErroDaApi(resposta.status, mensagem, corpo?.erros ?? [], correlationId, corpo ?? {});
  }
  return { dados: corpo as T, correlationId, duracaoMs: Math.round(performance.now() - inicio) };
}

export async function buscar<T>(url: string): Promise<T> {
  return (await requisitar<T>(url)).dados;
}

export function enviar<T>(url: string, metodo: "POST" | "PUT" | "PATCH" | "DELETE", corpo?: unknown) {
  return requisitar<T>(url, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
}
