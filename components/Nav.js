'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Network, Camera, Images } from 'lucide-react';

const items = [['/', 'Tree', Network], ['/camera', 'Camera', Camera], ['/gallery', 'Gallery', Images]];

export default function Nav() {
  const path = usePathname();
  if (path.startsWith('/admin')) return null;
  return (
    <nav className="nav" aria-label="Main">
      {items.map(([href, label, Icon]) => (
        <Link key={href} href={href} className={path === href ? 'active' : ''} aria-current={path === href ? 'page' : undefined}>
          <Icon size={22} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
