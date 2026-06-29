import { api } from "../client";
import { adaptLoyaltyCard, adaptLoyaltyProgram, adaptLoyaltyVoucher, adaptLoyaltyWallet } from "./adapters";
import type { BusinessLoyaltyProgramDetail, LoyaltyCatalogItem, LoyaltyProgramConfig, LoyaltyProgramDetail, LoyaltyProgramInput, LoyaltyVoucher, LoyaltyVoucherWallet, UnifiedStaffScan } from "./types";

type Page<T> = { results: T[] };
type Raw = Record<string, unknown>;

export const loyaltyApi = {
  cards: () => api.get<Page<Raw>>("/api/customer/loyalty/cards/").then((data) => data.results.map(adaptLoyaltyCard)),
  businessProgramsForCustomer: (businessId: string) => api.get<Page<Raw>>(`/api/customer/loyalty/businesses/${businessId}/loyalty/`).then((data) => data.results.map(adaptLoyaltyCard)),
  customerProgram: (id: string) => api.get<Raw>(`/api/customer/loyalty/programs/${id}/`).then((raw) => ({ ...adaptLoyaltyCard(raw), history: Array.isArray(raw.history) ? raw.history : [] } as LoyaltyProgramDetail)),
  join: (id: string) => api.post<Raw>(`/api/customer/loyalty/programs/${id}/join/`).then(adaptLoyaltyCard),
  redeemPoints: (id: string, points: number) => api.post<Raw>(`/api/customer/loyalty/programs/${id}/redeem-points/`, { points }).then(adaptLoyaltyVoucher),
  catalog: (id: string) => api.get<Page<LoyaltyCatalogItem>>(`/api/customer/loyalty/programs/${id}/catalog/`).then((data) => data.results),
  vouchers: (): Promise<LoyaltyVoucherWallet> => api.get<Raw>("/api/customer/loyalty/vouchers/").then(adaptLoyaltyWallet),
  selectVoucherItem: (voucherId: string, catalogItemId: string) => api.post<Raw>(`/api/customer/loyalty/vouchers/${voucherId}/select-item/`, { catalog_item_id: catalogItemId }).then(adaptLoyaltyVoucher),
  businessPrograms: (): Promise<LoyaltyProgramConfig[]> => api.get<Page<Raw>>("/api/business/loyalty/programs/").then((data) => data.results.map(adaptLoyaltyProgram)),
  createProgram: (input: LoyaltyProgramInput) => api.post<Raw>("/api/business/loyalty/programs/", input).then(adaptLoyaltyProgram),
  updateProgram: (id: string, input: Partial<LoyaltyProgramInput>) => api.patch<Raw>(`/api/business/loyalty/programs/${id}/`, input).then(adaptLoyaltyProgram),
  businessProgramDetail: (id: string) => api.get<BusinessLoyaltyProgramDetail>(`/api/business/loyalty/programs/${id}/`),
  action: (id: string, action: "pause" | "activate" | "archive") => api.post<Raw>(`/api/business/loyalty/programs/${id}/${action}/`).then(adaptLoyaltyProgram),
  award: (body: { token: string; program_id: string; amount?: string }) => api.post<Raw>("/api/staff/loyalty/award/", body),
  redeemVoucher: (code: string): Promise<LoyaltyVoucher> => api.post<Raw>("/api/staff/loyalty/redeem-voucher/", { code }).then(adaptLoyaltyVoucher),
  unifiedScan: (token: string): Promise<UnifiedStaffScan> => api.post<UnifiedStaffScan>("/api/staff/scan/", { token }),
};

export type LoyaltyApi = typeof loyaltyApi;
