import { FileCheck, CreditCard, Truck, FileText } from "lucide-react";

export type DocumentTypeKey = "invoice" | "eft_receipt" | "e-way-bill";

export interface DocumentTypeMeta {
  icon: typeof FileText; // lucide icon component type
  color: string;
  bgColor: string;
  title: string;
}

export const documentTypes: Record<DocumentTypeKey, DocumentTypeMeta> = {
  invoice: {
    icon: FileCheck,
    color: "text-blue-500",
    bgColor: "bg-blue-100",
    title: "Invoice",
  },
  eft_receipt: {
    icon: CreditCard,
    color: "text-green-500",
    bgColor: "bg-green-100",
    title: "EFT Receipt",
  },
  "e-way-bill": {
    icon: Truck,
    color: "text-amber-500",
    bgColor: "bg-amber-100",
    title: "E-Way Bill",
  },
};
