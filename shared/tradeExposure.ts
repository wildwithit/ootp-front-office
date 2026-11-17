export interface TradeSalaryYear {
  year: number;
  source: 'contract' | 'extension';
  salary: number | null;
  transferred: number | null;
  retainedByPriorClub: number | null;
  options: string[];
  optionDataMissing: boolean;
}

export interface PlayerExposure {
  playerId: number;
  name: string;
  currentSalary: number | null;
  contractYears: number | null;
  contractThrough: number | null;
  extensionFrom: number | null;
  extensionThrough: number | null;
  guaranteedKnown: number;
  guaranteedIncomplete: boolean;
  control: string | null;
  freeAgencyAfter: number | null;
  years: TradeSalaryYear[];
}

export interface TradeExposure {
  season: number;
  guideline: number | null;
  outgoing: PlayerExposure[];
  incoming: PlayerExposure[];
  payrollYears: Array<{
    year: number;
    guaranteedDelta: number | null;
    scheduledDelta: number | null;
    exportPayroll: number | null;
    afterTrade: number | null;
    overGuideline: boolean;
  }>;
  warnings: string[];
}
