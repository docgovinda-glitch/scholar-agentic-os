/**
 * Lucide icons a card may show, by name. Only the allowlisted icons are
 * imported (tree-shaken), and any other name renders FALLBACK_ICON.
 *
 * iconSvg() turns the same icon into a standalone SVG string so the .pptx
 * exporter draws exactly the glyph the web canvas shows.
 */
import type { ComponentType, ReactElement } from 'react';
import {
  Target as TargetIcon,
  Lightbulb as LightbulbIcon,
  Rocket as RocketIcon,
  ShieldCheck as ShieldCheckIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Minus as MinusIcon,
  Users as UsersIcon,
  User as UserIcon,
  Globe as GlobeIcon,
  Layers as LayersIcon,
  LayoutGrid as LayoutGridIcon,
  ChartColumn as ChartColumnIcon,
  ChartPie as ChartPieIcon,
  ChartLine as ChartLineIcon,
  Database as DatabaseIcon,
  Cpu as CpuIcon,
  Brain as BrainIcon,
  BookOpen as BookOpenIcon,
  GraduationCap as GraduationCapIcon,
  FlaskConical as FlaskConicalIcon,
  Microscope as MicroscopeIcon,
  Search as SearchIcon,
  Compass as CompassIcon,
  Map as MapIcon,
  Flag as FlagIcon,
  Clock as ClockIcon,
  Calendar as CalendarIcon,
  Check as CheckIcon,
  X as XIcon,
  CircleAlert as CircleAlertIcon,
  TriangleAlert as TriangleAlertIcon,
  ArrowRight as ArrowRightIcon,
  Zap as ZapIcon,
  Sparkles as SparklesIcon,
  Heart as HeartIcon,
  Leaf as LeafIcon,
  Scale as ScaleIcon,
  Gavel as GavelIcon,
  Building2 as Building2Icon,
  Briefcase as BriefcaseIcon,
  Coins as CoinsIcon,
  Handshake as HandshakeIcon,
  MessageSquare as MessageSquareIcon,
  Megaphone as MegaphoneIcon,
  Settings as SettingsIcon,
  Wrench as WrenchIcon,
  Puzzle as PuzzleIcon,
  Network as NetworkIcon,
  Link as LinkIcon,
  Lock as LockIcon,
  Eye as EyeIcon,
  Award as AwardIcon,
  Star as StarIcon,
  Quote as QuoteIcon,
  FileText as FileTextIcon,
  CircleDot as CircleDotIcon,
  ListChecks as ListChecksIcon,
  type LucideProps,
} from 'lucide-react';
import { resolveIconName, type SlideIconName } from '../../../domain/presentation/slideSchema';

export const SLIDE_ICONS: Record<SlideIconName, ComponentType<LucideProps>> = {
  'target': TargetIcon,
  'lightbulb': LightbulbIcon,
  'rocket': RocketIcon,
  'shield-check': ShieldCheckIcon,
  'trending-up': TrendingUpIcon,
  'trending-down': TrendingDownIcon,
  'minus': MinusIcon,
  'users': UsersIcon,
  'user': UserIcon,
  'globe': GlobeIcon,
  'layers': LayersIcon,
  'layout-grid': LayoutGridIcon,
  'chart-column': ChartColumnIcon,
  'chart-pie': ChartPieIcon,
  'chart-line': ChartLineIcon,
  'database': DatabaseIcon,
  'cpu': CpuIcon,
  'brain': BrainIcon,
  'book-open': BookOpenIcon,
  'graduation-cap': GraduationCapIcon,
  'flask-conical': FlaskConicalIcon,
  'microscope': MicroscopeIcon,
  'search': SearchIcon,
  'compass': CompassIcon,
  'map': MapIcon,
  'flag': FlagIcon,
  'clock': ClockIcon,
  'calendar': CalendarIcon,
  'check': CheckIcon,
  'x': XIcon,
  'circle-alert': CircleAlertIcon,
  'triangle-alert': TriangleAlertIcon,
  'arrow-right': ArrowRightIcon,
  'zap': ZapIcon,
  'sparkles': SparklesIcon,
  'heart': HeartIcon,
  'leaf': LeafIcon,
  'scale': ScaleIcon,
  'gavel': GavelIcon,
  'building-2': Building2Icon,
  'briefcase': BriefcaseIcon,
  'coins': CoinsIcon,
  'handshake': HandshakeIcon,
  'message-square': MessageSquareIcon,
  'megaphone': MegaphoneIcon,
  'settings': SettingsIcon,
  'wrench': WrenchIcon,
  'puzzle': PuzzleIcon,
  'network': NetworkIcon,
  'link': LinkIcon,
  'lock': LockIcon,
  'eye': EyeIcon,
  'award': AwardIcon,
  'star': StarIcon,
  'quote': QuoteIcon,
  'file-text': FileTextIcon,
  'circle-dot': CircleDotIcon,
  'list-checks': ListChecksIcon,
};

/** Component for any icon name (unknown names give the fallback icon). */
export function slideIcon(name: string | undefined): ComponentType<LucideProps> {
  return SLIDE_ICONS[resolveIconName(name)];
}

type IconNode = Array<[string, Record<string, string | number>]>;

/**
 * The SVG primitives behind a Lucide icon. lucide-react icons are
 * forwardRef components whose render function returns an <Icon> element
 * carrying `iconNode`; reading it keeps the drawing identical to the web.
 */
function iconNode(name: string): IconNode {
  const comp = slideIcon(name) as unknown as { render?: (props: object, ref: null) => ReactElement<{ iconNode?: IconNode }> };
  try {
    return comp.render?.({}, null)?.props?.iconNode ?? [];
  } catch {
    return [];
  }
}

const escapeAttr = (v: string | number) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Standalone SVG markup for an icon, stroked in `color`. */
export function iconSvg(name: string, color: string, strokeWidth = 2): string {
  const body = iconNode(name)
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${escapeAttr(color)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  );
}

/** iconSvg() as a base64 data URL (for pptxgenjs addImage). */
export function iconDataUrl(name: string, color: string, strokeWidth = 2): string {
  const svg = iconSvg(name, color, strokeWidth);
  const b64 = typeof btoa === 'function' ? btoa(svg) : Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}
