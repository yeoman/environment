import crypto from 'node:crypto';
import { toNamespace } from '@yeoman/namespace';
import type { BaseGenerator, Logger } from '@yeoman/types';
import createdLogger from 'debug';

const debug = createdLogger('yeoman:environment:composed-store');

type UniqueFeatureType = 'customCommitTask' | 'customInstallTask';

export class ComposedStore {
  private readonly log?;
  private readonly generators: Record<string, BaseGenerator> = {};
  private readonly uniqueByPathMap = new Map<string, Map<string, BaseGenerator>>();
  private readonly uniqueGloballyMap = new Map<string, BaseGenerator>();

  constructor({ log }: { log?: Logger } = {}) {
    this.log = log;
  }

  get customCommitTask() {
    return this.findUniqueFeature('customCommitTask');
  }

  get customInstallTask() {
    return this.findUniqueFeature('customInstallTask');
  }

  getGenerators(): Record<string, BaseGenerator> {
    return { ...this.generators };
  }

  addGenerator(generator: BaseGenerator) {
    const { features = (generator as any).getFeatures?.() ?? {} } = generator;
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
      return { uniqueBy, identifier, added: false, generator: uniqueByMap.get(uniqueBy) };
    }

    uniqueByMap.set(uniqueBy, generator);

    this.generators[uniqueGlobally ? uniqueBy : `${generatorRoot}#${uniqueBy}`] = generator;
    return { identifier, added: true, generator };
  }

  getUniqueByPathMap(root: string): Map<string, BaseGenerator> {
    if (!this.uniqueByPathMap.has(root)) {
      this.uniqueByPathMap.set(root, new Map());
    }

    return this.uniqueByPathMap.get(root)!;
  }

  findFeature(featureName: string): Array<{ generatorId: string; feature: any }> {
    return Object.entries(this.generators)
      .map(([generatorId, generator]) => {
        const { features = (generator as any).getFeatures?.() } = generator;
        const feature = features?.[featureName];
        return feature ? { generatorId, feature } : undefined;
      })
      .filter(Boolean) as any;
  }

  private findUniqueFeature(featureName: UniqueFeatureType) {
    const providedFeatures = this.findFeature(featureName);
    if (providedFeatures.length > 0) {
      if (providedFeatures.length > 1) {
        this.log?.info?.(
          `Multiple ${featureName} tasks found (${providedFeatures.map(({ generatorId }) => generatorId).join(', ')}). Using the first.`,
        );
      }

      const [{ generatorId, feature }] = providedFeatures;
      debug(`Feature ${featureName} provided by ${generatorId}`);
      return feature;
    }

    return;
  }
}
