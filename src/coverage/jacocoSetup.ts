import * as fs from 'fs';
import * as path from 'path';

const JACOCO_PROFILE_XML = `    <profile>
      <id>coverage</id>
      <activation>
        <activeByDefault>false</activeByDefault>
      </activation>
      <build>
        <plugins>
          <plugin>
            <groupId>org.jacoco</groupId>
            <artifactId>jacoco-maven-plugin</artifactId>
            <version>0.8.11</version>
            <executions>
              <execution>
                <id>aem-toolkit-jacoco-prepare-agent</id>
                <goals>
                  <goal>prepare-agent</goal>
                </goals>
              </execution>
              <execution>
                <id>aem-toolkit-jacoco-report</id>
                <phase>test</phase>
                <goals>
                  <goal>report</goal>
                </goals>
              </execution>
            </executions>
          </plugin>
        </plugins>
      </build>
    </profile>
`;

/**
 * Agrega un perfil 'coverage' (jacoco-maven-plugin) al pom.xml raíz — heredado por todos los
 * módulos hijos (incluido 'core', donde viven los tests), igual que autoInstallBundle/Package.
 * Se agrega como perfil aparte (no activo por defecto) para no afectar compilaciones normales.
 * Devuelve false si no se pudo (ej. el pom no tiene </profiles>, formato inesperado).
 */
export function addJacocoProfile(rootPath: string): boolean {
  const pomPath = path.join(rootPath, 'pom.xml');
  let xml: string;
  try {
    xml = fs.readFileSync(pomPath, 'utf8');
  } catch {
    return false;
  }
  if (xml.includes('jacoco-maven-plugin')) return true;
  if (!xml.includes('</profiles>')) return false;

  const updated = xml.replace('</profiles>', `${JACOCO_PROFILE_XML}  </profiles>`);
  try {
    fs.writeFileSync(pomPath, updated, 'utf8');
    return true;
  } catch {
    return false;
  }
}
