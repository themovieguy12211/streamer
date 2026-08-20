export type AdConfiguration = { popAdsScriptUrl?: string; vastTagUrl?: string };
export interface AdProvider { getConfiguration(input: { videoId: string; isPremium: boolean }): Promise<AdConfiguration>; }
export class ConfiguredAdProvider implements AdProvider {
  constructor(private readonly config: AdConfiguration) {}
  async getConfiguration({ isPremium }: { videoId: string; isPremium: boolean }) { return isPremium ? {} : this.config; }
}
