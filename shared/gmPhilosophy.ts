export const GUIDANCE_LIMIT = 4000;
export const PROTECTED_LIMIT = 30;

export interface ProtectedPlayer {
  id: number;
  name: string;
}

export interface GMPhilosophy {
  guidance: string;
  payrollGuideline: number | null;
  protectedPlayers: ProtectedPlayer[];
}

export interface PhilosophyEditorData {
  saveKey: string;
  revision: number;
  philosophy: GMPhilosophy;
  rangersTemplate: (GMPhilosophy & { unresolved: string[] }) | null;
}
