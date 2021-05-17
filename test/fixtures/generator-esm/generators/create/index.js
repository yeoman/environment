export async function createGenerator(env) {
  const ParentGenerator = await env.requireGenerator('mocked-generator');
  return class NewGenerator extends ParentGenerator {
    default() {
      super.mockedDefault();
    }
  };
}
