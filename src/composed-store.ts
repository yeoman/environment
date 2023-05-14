import crypto from 'node:crypto';
import { toNamespace } from '@yeoman/namespace';
import type { Logger, BaseGenerator } from '@yeoman/types';

type UniqueFeatureType = 'customCommitTask' | 'customInstallTask';
const uniqueFeatureValues: UniqueFeatureType[] = ['customCommitTask', 'customInstallTask'];

export class ComposedStore {
  private readonly log?;
  private readonly generators: Record<string, BaseGenerator> = {};
  private readonly uniqueByPathMap = new Map<string, Map<string, BaseGenerator>>();
  private readonly uniqueGloballyMap = new Map<string, BaseGenerator>();
  private readonly uniqueFeatures = new Map<UniqueFeatureType, true | (() => Promise<void>)>();

  constructor({ log }: { log?: Logger } = {}) {
    this.log = log;
  }

  get customCommitTask() {
    return this.uniqueFeatures.get('customCommitTask');
  }

  get customInstallTask() {
    return this.uniqueFeatures.get('customInstallTask');
  }

  getGenerators(): Record<string, BaseGenerator> {
    return { ...this.generators };
  }

  addGenerator(generator: any) {
    const features = generator.getFeatures?.() ?? {};
    let { uniqueBy } = features;
    const { uniqueGlobally } = features;

    let identifier = uniqueBy;
    if (!uniqueBy) {
      const { namespace } = generator.options;
      const instanceId = crypto.randomBytes(20).toString('hex');
      let namespaceDefinition = toNamespace(namespace);
      if (namespaceDefinition) {
        namespaceDefinition = namespaceDefinition.with({ instanceId });
        uniqueBy = namespaceDefinition.id;
        identifier = namespaceDefinition.namespace;
      } else {
        uniqueBy = `${namespace}#${instanceId}`;
        identifier = namespace;
      }
    }

    const generatorRoot = generator.destinationRoot();
    const uniqueByMap = uniqueGlobally ? this.uniqueGloballyMap : this.getUniqueByPathMap(generatorRoot);
    if (uniqueByMap.has(uniqueBy)) {
      return { uniqueBy, added: false, generator: uniqueByMap.get(uniqueBy) };
    }

    uniqueByMap.set(uniqueBy, generator);

    for (const featureName of uniqueFeatureValues) {
      const feature = features[featureName];
      if (feature) {
        const existingFeature = this.uniqueFeatures.get(feature);
        if (typeof existingFeature !== 'function') {
          this.uniqueFeatures.set(featureName, feature);
        } else if (typeof feature === 'function') {
          this.log?.info?.(`Multiple ${featureName} tasks found. Using the first.`);
        }
      }
    }

    this.generators[uniqueGlobally ? uniqueBy : `${generatorRoot}#${uniqueBy}`] = generator;
    return { identifier, added: true, generator };
  }

  getUniqueByPathMap(root: string): Map<string, BaseGenerator> {
    if (!this.uniqueByPathMap.has(root)) {
      this.uniqueByPathMap.set(root, new Map());
    }

    return this.uniqueByPathMap.get(root)!;
  }
}
