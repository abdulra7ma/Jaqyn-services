"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loyaltyApi } from "./api";
import type { LoyaltyProgramInput } from "./types";

export const loyaltyKeys = {
  all: ["loyalty"] as const,
  cards: ["loyalty", "cards"] as const,
  business: (id: string) => ["loyalty", "business", id] as const,
  program: (id: string) => ["loyalty", "program", id] as const,
  catalog: (id: string) => ["loyalty", "catalog", id] as const,
  vouchers: ["loyalty", "vouchers"] as const,
  ownerPrograms: ["loyalty", "owner", "programs"] as const,
  ownerProgram: (id: string) => ["loyalty", "owner", "program", id] as const,
};

export const useLoyaltyCards = () => useQuery({ queryKey: loyaltyKeys.cards, queryFn: loyaltyApi.cards });
export const useBusinessLoyalty = (id: string) => useQuery({ queryKey: loyaltyKeys.business(id), queryFn: () => loyaltyApi.businessProgramsForCustomer(id), enabled: !!id });
export const useLoyaltyProgram = (id: string) => useQuery({ queryKey: loyaltyKeys.program(id), queryFn: () => loyaltyApi.customerProgram(id), enabled: !!id });
export const useLoyaltyCatalog = (id: string, enabled = true) => useQuery({ queryKey: loyaltyKeys.catalog(id), queryFn: () => loyaltyApi.catalog(id), enabled: enabled && !!id });
export const useLoyaltyVouchers = () => useQuery({ queryKey: loyaltyKeys.vouchers, queryFn: loyaltyApi.vouchers });
export const useBusinessLoyaltyPrograms = () => useQuery({ queryKey: loyaltyKeys.ownerPrograms, queryFn: loyaltyApi.businessPrograms });
export const useLoyaltyProgramDetail = (id: string) => useQuery({ queryKey: loyaltyKeys.ownerProgram(id), queryFn: () => loyaltyApi.businessProgramDetail(id), enabled: !!id });

export const useJoinLoyalty = () => { const qc = useQueryClient(); return useMutation({ mutationFn: loyaltyApi.join, onSuccess: (card) => { qc.setQueryData(loyaltyKeys.program(card.program_id), card); qc.invalidateQueries({ queryKey: loyaltyKeys.cards }); qc.invalidateQueries({ queryKey: loyaltyKeys.business(card.business_id) }); } }); };
export const useRedeemPoints = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ programId, points }: { programId: string; points: number }) => loyaltyApi.redeemPoints(programId, points), onSuccess: (_voucher, args) => { qc.invalidateQueries({ queryKey: loyaltyKeys.program(args.programId) }); qc.invalidateQueries({ queryKey: loyaltyKeys.cards }); qc.invalidateQueries({ queryKey: loyaltyKeys.vouchers }); } }); };
export const useSelectVoucherItem = () => { const qc = useQueryClient(); return useMutation({ mutationFn: ({ voucherId, catalogItemId }: { voucherId: string; catalogItemId: string }) => loyaltyApi.selectVoucherItem(voucherId, catalogItemId), onSuccess: () => qc.invalidateQueries({ queryKey: loyaltyKeys.vouchers }) }); };
export const useCreateLoyaltyProgram = () => { const qc = useQueryClient(); return useMutation({ mutationFn: (input: LoyaltyProgramInput) => loyaltyApi.createProgram(input), onSuccess: () => qc.invalidateQueries({ queryKey: loyaltyKeys.ownerPrograms }) }); };
const lifecycle = (action: "pause" | "activate" | "archive") => () => { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => loyaltyApi.action(id, action), onSuccess: (program) => { qc.invalidateQueries({ queryKey: loyaltyKeys.ownerPrograms }); qc.invalidateQueries({ queryKey: loyaltyKeys.ownerProgram(program.id) }); } }); };
export const usePauseLoyaltyProgram = lifecycle("pause");
export const useActivateLoyaltyProgram = lifecycle("activate");
export const useArchiveLoyaltyProgram = lifecycle("archive");
export const useLoyaltyAward = () => useMutation({ mutationFn: loyaltyApi.award });
export const useRedeemLoyaltyVoucher = () => useMutation({ mutationFn: loyaltyApi.redeemVoucher });
export const useUnifiedScan = () => useMutation({ mutationFn: loyaltyApi.unifiedScan });
