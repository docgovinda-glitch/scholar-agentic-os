import { useCallback, useMemo, useState } from "react";
import { countActiveFilters, DEFAULT_SOURCE_FILTERS, type SourceSort, type SourceTab } from "../../services/sourceFilters";

/** The Sources stage's tab, search and filter state, with a reset. */
export function useSourceFilters() {
  const [activeTab, setActiveTab] = useState<SourceTab>(DEFAULT_SOURCE_FILTERS.activeTab);
  const [searchQuery, setSearchQuery] = useState(DEFAULT_SOURCE_FILTERS.searchQuery);
  const [selectedType, setSelectedType] = useState<string>(DEFAULT_SOURCE_FILTERS.selectedType);
  const [selectedRole, setSelectedRole] = useState<string>(DEFAULT_SOURCE_FILTERS.selectedRole);
  const [selectedMethodology, setSelectedMethodology] = useState<string>(DEFAULT_SOURCE_FILTERS.selectedMethodology);
  const [selectedYearRange, setSelectedYearRange] = useState<string>(DEFAULT_SOURCE_FILTERS.selectedYearRange);
  const [minRelevance, setMinRelevance] = useState<number>(DEFAULT_SOURCE_FILTERS.minRelevance);
  const [openAccessOnly, setOpenAccessOnly] = useState<boolean>(DEFAULT_SOURCE_FILTERS.openAccessOnly);
  const [sortBy, setSortBy] = useState<SourceSort>(DEFAULT_SOURCE_FILTERS.sortBy);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const criteria = useMemo(
    () => ({ activeTab, searchQuery, selectedType, selectedRole, selectedMethodology, selectedYearRange, minRelevance, openAccessOnly, sortBy }),
    [activeTab, searchQuery, selectedType, selectedRole, selectedMethodology, selectedYearRange, minRelevance, openAccessOnly, sortBy]
  );

  /** Clears every filter and the search (the tab stays). */
  const resetAllFilters = useCallback(() => {
    setSelectedType("all");
    setSelectedRole("all");
    setSelectedMethodology("all");
    setSelectedYearRange("all");
    setMinRelevance(0);
    setOpenAccessOnly(false);
    setSortBy("relevance");
    setSearchQuery("");
  }, []);

  return {
    ...criteria,
    setActiveTab, setSearchQuery, setSelectedType, setSelectedRole, setSelectedMethodology, setSelectedYearRange,
    setMinRelevance, setOpenAccessOnly, setSortBy, showAdvancedFilters, setShowAdvancedFilters,
    activeFilterCount: countActiveFilters(criteria),
    resetAllFilters,
  };
}
