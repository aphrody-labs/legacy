import { ReceiptText } from "@auto/ui/symboles";

/** Official assets served locally; the neighbouring visible label gives the accessible name. */
export function LogoFournisseur({ fournisseur }: { fournisseur: string }) {
  return fournisseur === "google" || fournisseur === "microsoft" ? (
    <img
      className="logo-fournisseur"
      src={`/brands/${fournisseur}.svg`}
      width="24"
      height="24"
      alt=""
      aria-hidden="true"
    />
  ) : (
    <ReceiptText className="icone" aria-hidden="true" />
  );
}
