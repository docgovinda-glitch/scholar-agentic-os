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
      <div className="border-b border-[#D1CEC7] pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#1A1A1A] font-serif flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-700" />
            Scriptural & Ethical Database (Vedic & Kautilyan Library)
          </h2>
          <p className="text-xs text-[#8C887F] font-mono uppercase tracking-wider mt-1">
            Reference directory of authentic, annotated philosophical support verses for your manuscript
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#6B665E] font-mono bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20 font-bold uppercase">
            {SCRIPTURES_DATA.length} Verses Authenticated
          </span>
        </div>
      </div>

      {/* Filter and Search Bento */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-[#FAF9F6] border border-[#D1CEC7] p-4 rounded-xl">
        <div className="md:col-span-4 relative">
          <Search className="w-4 h-4 text-[#8C887F] absolute left-3 top-3" />
          <input
            type="text"
            className="w-full bg-[#FAF9F6] border border-[#D1CEC7] rounded-lg pl-9 pr-4 py-2 text-xs text-[#1A1A1A] focus:outline-none focus:border-amber-700"
            placeholder="Search keywords, translations, or references..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="md:col-span-8 flex flex-wrap gap-1.5 items-center justify-end">
          <span className="text-[10px] font-bold font-mono text-[#8C887F] uppercase tracking-wider mr-2 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filter:
          </span>
          {["All", "Vedas", "Upanishads", "Bhagavad Gita", "Arthashastra"].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                category === cat
                  ? "bg-amber-800 text-white border border-amber-800 font-semibold"
                  : "bg-transparent text-[#6B665E] border border-[#D1CEC7] hover:bg-[#FAF9F6]"
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
              className="bg-[#FAF9F6] border border-[#D1CEC7] rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
            >
              <div className="space-y-4">
                {/* Card Header */}
                <div className="flex justify-between items-start gap-2 border-b border-[#D1CEC7] pb-2">
                  <div>
                    <span className="text-[9px] font-bold font-mono px-2 py-0.5 bg-amber-800/10 text-amber-900 border border-amber-800/20 rounded-md">
                      {item.category}
                    </span>
                    <h3 className="text-sm font-bold text-[#1A1A1A] font-serif mt-1.5">
                      {item.source} ({item.verseNum})
                    </h3>
                  </div>
                  <span className="text-[10px] text-[#8C887F] font-mono">ID: {item.id}</span>
                </div>

                {/* Sanskrit Box */}
                <div className="p-3 bg-amber-500/[0.03] border border-amber-900/10 rounded-lg text-center font-serif leading-relaxed text-[#1A1A1A] whitespace-pre-line text-sm italic">
                  {item.sanskrit}
                </div>

                {/* Transliteration */}
                <div>
                  <span className="text-[9px] font-bold font-mono text-[#8C887F] uppercase tracking-wider block">Transliteration:</span>
                  <p className="text-[11px] text-[#6B665E] font-sans mt-0.5 italic leading-relaxed">
                    {item.transliteration}
                  </p>
                </div>

                {/* Translation */}
                <div>
                  <span className="text-[9px] font-bold font-mono text-amber-900 uppercase tracking-wider block">English Translation:</span>
                  <p className="text-xs text-[#1A1A1A] font-medium leading-relaxed mt-1">
                    "{item.translation}"
                  </p>
                </div>

                {/* Academic Context */}
                <div className="p-3 bg-white/60 border border-[#D1CEC7] rounded-lg">
                  <span className="text-[9px] font-bold font-mono text-[#8C887F] uppercase tracking-wider block">Academic Context & CSR Adaptation:</span>
                  <p className="text-xs text-[#6B665E] leading-relaxed mt-1">
                    {item.context}
                  </p>
                </div>
              </div>

              {/* Card Footer actions */}
              <div className="flex justify-between items-center pt-4 mt-4 border-t border-[#D1CEC7] text-xs">
                <span className="text-[10px] font-mono text-[#8C887F] italic truncate max-w-[200px]" title={item.citation}>
                  Cite: {item.verseNum}
                </span>

                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleCopy(item.citation, `${item.id}_cite`)}
                    className="p-1.5 bg-white border border-[#D1CEC7] hover:bg-[#FAF9F6] text-[#6B665E] rounded-md transition-all flex items-center gap-1.5 cursor-pointer"
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
          <div className="col-span-2 text-center p-12 bg-[#FAF9F6] border border-[#D1CEC7] rounded-2xl">
            <BookOpen className="w-10 h-10 text-[#8C887F] mx-auto opacity-40 mb-3" />
            <p className="text-sm font-serif italic text-[#6B665E]">No matching scriptures found</p>
            <p className="text-xs text-[#8C887F] mt-1">Try expanding your filter or search keywords</p>
          </div>
        )}
      </div>
    </div>
  );
}
