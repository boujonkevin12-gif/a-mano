import Link from "next/link";
import Image from "next/image";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link className={`brand${light ? " brand-light" : ""}`} href="/" aria-label="A Mano, inicio">
      <Image className="brand-logo" src="/a-mano-logo.png" alt="" width={900} height={660} priority />
    </Link>
  );
}
