import { loadAllLists, loadResources } from './utils';

import DynamicDataView from '../src/dynamic-data-view';
import Engine from '../src/engine/engine';
import ReverseIndex from '../src/engine/reverse-index';
import { parseList } from '../src/parsing/list';
import { NetworkFilter } from '../src/parsing/network-filter';
import {
  deserializeCosmeticFilter,
  deserializeEngine,
  deserializeNetworkFilter,
  deserializeReverseIndex,
  serializeCosmeticFilter,
  serializeEngine,
  serializeNetworkFilter,
  serializeReverseIndex,
} from '../src/serialization';

describe('Serialization', () => {
  const { networkFilters, cosmeticFilters } = parseList(loadAllLists());

  describe('filters', () => {
    it('cosmetic', () => {
      cosmeticFilters.forEach((filter) => {
        const buffer = new DynamicDataView(100);
        serializeCosmeticFilter(filter, buffer);
        buffer.seek(0);
        expect(deserializeCosmeticFilter(buffer)).toEqual(filter);
      });
    });

    it('network', () => {
      networkFilters.forEach((filter) => {
        const buffer = new DynamicDataView(100);
        serializeNetworkFilter(filter, buffer);
        buffer.seek(0);
        expect(deserializeNetworkFilter(buffer)).toEqual(filter);
      });
    });
  });

  it('ReverseIndex', () => {
    const filters = new Map();
    networkFilters.forEach((filter) => {
      filters.set(filter.getId(), filter);
    });

    // Initialize index
    const reverseIndex = new ReverseIndex<NetworkFilter>(
      (cb) => {
        networkFilters.forEach(cb);
      },
      (f: NetworkFilter) => f.getTokens(),
    );

    // Serialize index
    const buffer = new DynamicDataView(4000000);
    serializeReverseIndex(reverseIndex, buffer);
    buffer.seek(0);

    const deserialized: any = {};
    deserializeReverseIndex(buffer, deserialized, filters);

    expect(deserialized).toEqual({
      index: reverseIndex.index,
      size: reverseIndex.size,
    });
  });

  it('Engine', () => {
    const resources = loadResources();
    const filters = loadAllLists();

    const engine = new Engine({
      enableOptimizations: true,
      loadCosmeticFilters: true,
      loadNetworkFilters: true,
      optimizeAOT: false,
      version: 42,
    });

    engine.onUpdateFilters([{ filters, asset: 'list1', checksum: 'checksum' }]);

    engine.onUpdateResource([{ checksum: 'resources1', filters: resources }]);

    const serialized = serializeEngine(engine);
    expect(() => {
      deserializeEngine(serialized, 41);
    }).toThrow('serialized engine version mismatch');

    const deserialized = deserializeEngine(serialized, 42);
    expect(deserialized).not.toBe(null);
    if (deserialized !== null) {
      expect(deserialized.version).toEqual(engine.version);
      expect(deserialized.lists).toEqual(engine.lists);

      // NOTE: Here we only compare the index itself, and not the other
      // attributes which are functions since the `toEqual` does not handle
      // function comparison properly.

      // Buckets
      // Network
      expect(deserialized.exceptions.index.index).toEqual(engine.exceptions.index.index);
      expect(deserialized.importants.index.index).toEqual(engine.importants.index.index);
      expect(deserialized.redirects.index.index).toEqual(engine.redirects.index.index);
      expect(deserialized.filters.index.index).toEqual(engine.filters.index.index);

      // Cosmetic
      expect(deserialized.cosmetics.hostnameIndex.index).toEqual(
        engine.cosmetics.hostnameIndex.index,
      );
      expect(deserialized.cosmetics.selectorIndex.index).toEqual(
        engine.cosmetics.selectorIndex.index,
      );

      // Resources
      expect(deserialized.resourceChecksum).toEqual(engine.resourceChecksum);
      expect(deserialized.js).toEqual(engine.js);
      expect(deserialized.resources).toEqual(engine.resources);
    }
  });
});
