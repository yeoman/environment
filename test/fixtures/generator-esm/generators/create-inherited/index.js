export async function createGenerator(env) {
  const ParentGenerator = await env.requireGenerator('esm:create');
  return class NewGenerator extends ParentGenerator {
    default() {
      super.mockedDefault();
    }
  };
}
