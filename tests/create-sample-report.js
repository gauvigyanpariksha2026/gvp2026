const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'site', 'js', 'pdf-report.js'), 'utf8');
const context = vm.createContext({
  TextEncoder,
  atob: (b64) => Buffer.from(b64, 'base64').toString('binary')
});
vm.runInContext(source, context, { filename: 'site/js/pdf-report.js' });

const studentCount = Number(process.argv[2] || 18);
if (!Number.isInteger(studentCount) || studentCount < 1) {
  throw new Error('student count must be a positive integer');
}

const students = Array.from({ length: studentCount }, (_, index) => ({
  regNo: `GVP-2026-${String(index + 1).padStart(5, '0')}`,
  name: ['AARAV SHARMA', 'ANANYA JOSHI', 'VIVAAN MEHTA', 'SIYA PATEL'][index % 4],
  father: ['RAJESH SHARMA', 'MANOJ JOSHI', 'SANJAY MEHTA', 'DINESH PATEL'][index % 4],
  gender: index % 2 ? 'Female' : 'Male',
  cls: String(8 + (index % 5))
}));

context.GVP_PDF.buildStudentReport({
  school: {
    school: 'GOVT SENIOR SECONDARY SCHOOL PADWA',
    village: 'PADWA',
    block: 'SAGWARA',
    district: 'DUNGARPUR'
  },
  students
}).then((bytes) => {
  const outputPath = process.argv[3]
    ? path.resolve(root, process.argv[3])
    : path.join(root, 'output', 'pdf', 'gvp-school-participation-sample.pdf');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, bytes);
  console.log(outputPath);
});
