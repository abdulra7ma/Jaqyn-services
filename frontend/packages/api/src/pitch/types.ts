export type PitchResolve = {
  business_id: string;
  business_name: string;
  logo_url: string | null;
  category: string;
  default_goal: number;
  default_reward: string;
  published_count: number;
};

export type PitchClaimResult = {
  access: string;
  refresh: string;
  user: { id: string; role: string };
};

export type VerifyPitchInput = {
  token: string;
  email: string;
  code: string;
  goal: number;
  reward_text: string;
};
