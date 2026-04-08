export type AcceptedProveedorSpec = {
  codigo: string;
  nombre: string;
  motorId: number;
  hosts: string[];
};

export const PROVEEDORES_ACEPTADOS: AcceptedProveedorSpec[] = [
  {
    codigo: 'PURAQUIMICA',
    nombre: 'PuraQuimica',
    motorId: 1,
    hosts: ['puraquimica.com.ar', 'www.puraquimica.com.ar'],
  },
  {
    codigo: 'EUMA',
    nombre: 'EUMA',
    motorId: 2,
    hosts: ['euma.com.ar', 'www.euma.com.ar'],
  },
];

export function inferProveedorAceptadoFromUrl(rawUrl: string): AcceptedProveedorSpec | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    return (
      PROVEEDORES_ACEPTADOS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null
    );
  } catch {
    return null;
  }
}
