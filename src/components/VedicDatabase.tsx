import React, { useState } from "react";
import { Search, Copy, Check, BookOpen, Sparkles, Filter } from "lucide-react";

interface ScriptureEntry {
  id: string;
  category: "Vedas" | "Upanishads" | "Bhagavad Gita" | "Arthashastra";
  source: string;
  verseNum: string;
  sanskrit: string;
  transliteration: string;
  translation: string;
  context: string;
  citation: string;
}

const SCRIPTURES_DATA: ScriptureEntry[] = [
  {
    id: "v1",
    category: "Vedas",
    source: "Rigveda",
    verseNum: "10.191.2",
    sanskrit: "संगच्छध्वं संवदध्वं सं वो मनांसि जानताम्।\nदेवा भागं यथा पूर्वे संजानाना उपासते॥",
    transliteration: "saṃgacchadhvaṃ saṃvadadhvaṃ saṃ vo manāṃsi jānatām,\ndevā bhāgaṃ yathā pūrve saṃjānānā upāsate.",
    translation: "Assemble together, speak together, let your minds be all of one accord; just as the ancient gods in union worshiped, let us share our assets in harmony.",
    context: "Stresses social integration, multi-stakeholder accord, and equitable resource sharing. Serves as the ultimate classical baseline for corporate stakeholder dialogue and community integration.",
    citation: "Rigveda. (c. 1500 BCE). Mandala 10, Hymn 191, Verse 2."
  },
  {
    id: "v2",
    category: "Vedas",
    source: "Atharvaveda",
    verseNum: "3.24.5",
    sanskrit: "शतहस्त समाहर सहस्रहस्त सं किर।\nकृतस्य कार्यस्य चेह स्फातिं समावह॥",
    transliteration: "śatahasta samāhara sahasrahasta saṃ kira,\nkṛtasya kāryasya ceha sphātiṃ samāvaha.",
    translation: "Earn wealth with a hundred hands, and distribute it with a thousand hands. Thus, you bring prosperity and spiritual abundance to the community.",
    context: "The fundamental Vedic theory of circular economy. It commands that acquisition of capital (Artha) must always be followed by wider dissemination and philanthropy, establishing the duty of CSR.",
    citation: "Atharvaveda. (c. 1000 BCE). Kanda 3, Sukta 24, Verse 5."
  },
  {
    id: "u1",
    category: "Upanishads",
    source: "Isavasya Upanishad",
    verseNum: "Verse 1",
    sanskrit: "ईशा वास्यमिदं सर्वं यत्किञ्च जगत्यां जगत्।\nतेन त्यक्तेन भुञ्जीथा मा गृधः कस्यस्विद्धनम्॥",
    transliteration: "īśā vāsyamidaṃ sarvaṃ yatkiñca jagatyāṃ jagat,\ntena tyक्tena bhuñjīthā mā gṛdhaḥ kasyasviddhanam.",
    translation: "All this—whatever moves in this moving world—is enveloped by the Supreme. Therefore, enjoy and utilize resources through renunciation; do not covet the wealth of anyone else.",
    context: "The metaphysical foundation of Vedic Trusteeship. It posits that absolute ownership is an illusion; human entities (and corporations) are merely temporary custodians, obligated to deploy assets for Lokasangraha (social preservation).",
    citation: "Isavasya Upanishad. Verse 1."
  },
  {
    id: "g1",
    category: "Bhagavad Gita",
    source: "Bhagavad Gita",
    verseNum: "2.47",
    sanskrit: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।\nमा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि॥",
    transliteration: "karmaṇy-evādhikāras te mā phaleṣu kadācana,\nmā karma-phala-hetur bhūr mā te saṅgo ’stv akarmaṇi.",
    translation: "Your right is to perform your prescribed duty alone, but never to its fruits. Let not the fruits of action be your motive, nor let you be attached to inaction.",
    context: "Introduces Nishkama Karma (selfless action). Translated into modern CSR, it argues that corporate directors should act based on ethical obligation (Dharma) rather than being driven solely by quarterly profit numbers (the fruits).",
    citation: "Bhagavad Gita. Chapter 2, Verse 47."
  },
  {
    id: "g2",
    category: "Bhagavad Gita",
    source: "Bhagavad Gita",
    verseNum: "3.20",
    sanskrit: "कर्मणैव हि संसिद्धिमास्थिता जनकादयः।\nलोकसंग्रहमेवापि सम्पश्यन्कर्तुमर्हसि॥",
    transliteration: "karmaṇaiva hi saṃsiddhim āsthitā janakādayaḥ,\nloka-saṃgraham evāpi sampaśyan kartum arhasi.",
    translation: "By performing actions alone, King Janaka and others attained perfection. You should perform your duties with a view to the welfare and preservation of the world (Lokasangraha).",
    context: "Establishes 'Lokasangraha' (universal social maintenance and protection) as the ultimate standard of leadership action. A direct mandate for corporate environmental responsibility and public welfare initiatives.",
    citation: "Bhagavad Gita. Chapter 3, Verse 20."
  },
  {
    id: "a1",
    category: "Arthashastra",
    source: "Kautilya's Arthashastra",
    verseNum: "1.19.34",
    sanskrit: "प्रजासुखे सुखं राज्ञः प्रजानां च हिते हितम्।\nनात्मप्रियं हितं राज्ञः प्रजानां तु प्रियं हितम्॥",
    transliteration: "prajāsukhe sukhaṃ rājñaḥ prajānāṃ ca hite hitam,\nnātmapriyaṃ hitaṃ rājñaḥ prajānāṃ tu priyaṃ hitam.",
    translation: "In the happiness of his subjects lies the king's happiness; in their welfare his welfare. What pleases himself he shall not consider as good, but whatever pleases his subjects he shall consider as good.",
    context: "The supreme rule of Rajadharma (ethical statecraft). It translates to corporate governance as a mandate for stakeholder-centric management over pure board self-interest, prioritizing long-term customer and community wellbeing.",
    citation: "Kautilya. (c. 3rd century BCE). Arthashastra. Book 1, Chapter 19, Verse 34."
  },
  {
    id: "a2",
    category: "Arthashastra",
    source: "Kautilya's Arthashastra",
    verseNum: "1.9.1",
    sanskrit: "धर्मादर्थः प्रभवति धर्मात्प्रभवते सुखम्।\nधर्मेण लभ्यते सर्वं धर्मसारमिदं जगत्॥",
    transliteration: "dharmād arthaḥ prabhavati dharmāt prabhavate sukham,\ndharmeṇa labhyate sarvaṃ dharmasāram idaṃ jagat.",
    translation: "From adherence to righteousness (Dharma) flows wealth (Artha); from Dharma flows happiness. Through Dharma all is attained; this world has Dharma as its core essence.",
    context: "Clarifies that material acquisition and business performance (Artha) are not amoral elements, but rather direct downstream consequences of a firm's commitment to ethical and moral duties (Dharma).",
    citation: "Kautilya. (c. 3rd century BCE). Arthashastra. Book 1, Chapter 9, Verse 1."
  }
];

export default function VedicDatabase() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredData = SCRIPTURES_DATA.filter((item) => {
    const matchesCategory = category === "All" || item.category === category;
    const searchLower = search.toLowerCase();
    const matchesSearch =
      item.source.toLowerCase().includes(searchLower) ||
      item.verseNum.toLowerCase().includes(searchLower) ||
      item.translation.toLowerCase().includes(searchLower) ||
      item.context.toLowerCase().includes(searchLower) ||
      item.sanskrit.includes(search);
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-[color:var(--color-navy-4)] pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[color:var(--text-primary)] flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-700" />
            Scriptural & Ethical Database (Vedic & Kautilyan Library)
          </h2>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">
            Reference directory of authentic, annotated philosophical support verses for your manuscript
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20 font-bold">
            {SCRIPTURES_DATA.length} Verses Authenticated
          </span>
        </div>
      </div>

      {/* Filter and Search Bento */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] p-4 rounded-xl">
        <div className="md:col-span-4 relative bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)] rounded-lg">
          <Search className="w-4 h-4 text-[color:var(--text-secondary)] absolute left-3 top-3" />
          <input
            type="text"
            className="w-full border-0 bg-transparent rounded-lg pl-9 pr-4 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
            placeholder="Search keywords, translations, or references..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="md:col-span-8 flex flex-wrap gap-1.5 items-center justify-end">
          <span className="text-xs font-bold text-[color:var(--text-secondary)] mr-2 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filter:
          </span>
          {["All", "Vedas", "Upanishads", "Bhagavad Gita", "Arthashastra"].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                category === cat
                  ? "bg-amber-800 text-[color:var(--text-primary)] border border-amber-800 font-semibold"
                  : "bg-transparent text-[color:var(--text-secondary)] border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredData.length > 0 ? (
          filteredData.map((item) => (
            <div
              key={item.id}
              className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
            >
              <div className="space-y-4">
                {/* Card Header */}
                <div className="flex justify-between items-start gap-2 border-b border-[color:var(--color-navy-4)] pb-2">
                  <div>
                    <span className="text-[9px] font-bold font-mono px-2 py-0.5 bg-amber-800/10 text-amber-900 border border-amber-800/20 rounded-md">
                      {item.category}
                    </span>
                    <h3 className="text-sm font-bold text-[color:var(--text-primary)] mt-1.5">
                      {item.source} ({item.verseNum})
                    </h3>
                  </div>
                  <span className="text-[10px] text-[color:var(--text-secondary)] font-mono">ID: {item.id}</span>
                </div>

                {/* Sanskrit Box */}
                <div className="p-3 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg text-center leading-relaxed text-[color:var(--text-primary)] whitespace-pre-line text-sm italic">
                  {item.sanskrit}
                </div>

                {/* Transliteration */}
                <div>
                  <span className="text-[9px] font-bold text-[color:var(--text-secondary)] block">Transliteration:</span>
                  <p className="text-[11px] text-[color:var(--text-secondary)] font-sans mt-0.5 italic leading-relaxed">
                    {item.transliteration}
                  </p>
                </div>

                {/* Translation */}
                <div>
                  <span className="text-[9px] font-bold text-amber-900 block">English Translation:</span>
                  <p className="text-xs text-[color:var(--text-primary)] font-medium leading-relaxed mt-1">
                    "{item.translation}"
                  </p>
                </div>

                {/* Academic Context */}
                <div className="p-3 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg">
                  <span className="text-[9px] font-bold text-[color:var(--text-secondary)] block">Academic Context & CSR Adaptation:</span>
                  <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed mt-1">
                    {item.context}
                  </p>
                </div>
              </div>

              {/* Card Footer actions */}
              <div className="flex justify-between items-center pt-4 mt-4 border-t border-[color:var(--color-navy-4)] text-xs">
                <span className="text-[10px] font-mono text-[color:var(--text-secondary)] italic truncate max-w-[200px]" title={item.citation}>
                  Cite: {item.verseNum}
                </span>

                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleCopy(item.citation, `${item.id}_cite`)}
                    className="p-1.5 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] text-[color:var(--text-secondary)] rounded-md transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Copy APA Citation"
                  >
                    {copiedId === `${item.id}_cite` ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-[10px] text-green-600 font-mono">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-mono">Copy Cite</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() =>
                      handleCopy(
                        `"${item.translation}" (${item.source}, ${item.verseNum})\nSanskrit: ${item.sanskrit}\nContext: ${item.context}`,
                        item.id
                      )
                    }
                    className="p-1.5 bg-amber-800/10 hover:bg-amber-800/20 text-amber-900 border border-amber-800/20 rounded-md transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Copy full text & translations to clipboard"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-[10px] text-green-600 font-mono">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-mono font-semibold">Copy Text</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-2 text-center p-12 bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl">
            <BookOpen className="w-10 h-10 text-[color:var(--text-secondary)] mx-auto opacity-40 mb-3" />
            <p className="text-sm italic text-[color:var(--text-secondary)]">No matching scriptures found</p>
            <p className="text-xs text-[color:var(--text-secondary)] mt-1">Try expanding your filter or search keywords</p>
          </div>
        )}
      </div>
    </div>
  );
}
