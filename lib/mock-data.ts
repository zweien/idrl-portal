import type { Person, Workstation, Resource, NewsItem, Floor as FloorType, NewWorkstation } from './types'

// ============ Personnel Mock Data ============
export const mockPersonnel: Person[] = [
  {
    id: '1',
    name: '张教授',
    role: 'professor',
    email: 'zhang@idrl.edu.cn',
    status: 'online',
    workstationId: 'ws-a1',
    researchAreas: ['深度学习', '计算机视觉'],
    avatar: '',
  },
  {
    id: '2',
    name: '李明',
    role: 'postdoc',
    email: 'liming@idrl.edu.cn',
    status: 'online',
    workstationId: 'ws-a2',
    researchAreas: ['强化学习', '机器人'],
  },
  {
    id: '3',
    name: '王小红',
    role: 'phd',
    email: 'wxh@idrl.edu.cn',
    status: 'busy',
    workstationId: 'ws-b1',
    researchAreas: ['自然语言处理'],
  },
  {
    id: '4',
    name: '刘强',
    role: 'phd',
    email: 'liuqiang@idrl.edu.cn',
    status: 'offline',
    workstationId: 'ws-b2',
    researchAreas: ['图神经网络'],
  },
  {
    id: '5',
    name: '陈思',
    role: 'master',
    email: 'chensi@idrl.edu.cn',
    status: 'online',
    workstationId: 'ws-c1',
    researchAreas: ['多模态学习'],
  },
  {
    id: '6',
    name: '赵婷',
    role: 'master',
    email: 'zhaoting@idrl.edu.cn',
    status: 'leave',
    workstationId: 'ws-c2',
    researchAreas: ['知识图谱'],
  },
  {
    id: '7',
    name: '周杰',
    role: 'undergraduate',
    email: 'zhoujie@idrl.edu.cn',
    status: 'online',
    workstationId: 'ws-d1',
    researchAreas: ['数据挖掘'],
  },
  {
    id: '8',
    name: '吴芳',
    role: 'staff',
    email: 'wufang@idrl.edu.cn',
    status: 'online',
    workstationId: 'ws-d2',
    researchAreas: [],
  },
]

// ============ Workstation Layout ============
export const mockWorkstations: Workstation[] = [
  // Zone A - Professor & Postdoc
  { id: 'ws-a1', name: 'A-01', x: 50, y: 50, width: 80, height: 60, zone: 'A', personId: '1' },
  { id: 'ws-a2', name: 'A-02', x: 150, y: 50, width: 80, height: 60, zone: 'A', personId: '2' },
  { id: 'ws-a3', name: 'A-03', x: 250, y: 50, width: 80, height: 60, zone: 'A' },
  // Zone B - PhD Students
  { id: 'ws-b1', name: 'B-01', x: 50, y: 150, width: 80, height: 60, zone: 'B', personId: '3' },
  { id: 'ws-b2', name: 'B-02', x: 150, y: 150, width: 80, height: 60, zone: 'B', personId: '4' },
  { id: 'ws-b3', name: 'B-03', x: 250, y: 150, width: 80, height: 60, zone: 'B' },
  { id: 'ws-b4', name: 'B-04', x: 350, y: 150, width: 80, height: 60, zone: 'B' },
  // Zone C - Master Students
  { id: 'ws-c1', name: 'C-01', x: 50, y: 250, width: 80, height: 60, zone: 'C', personId: '5' },
  { id: 'ws-c2', name: 'C-02', x: 150, y: 250, width: 80, height: 60, zone: 'C', personId: '6' },
  { id: 'ws-c3', name: 'C-03', x: 250, y: 250, width: 80, height: 60, zone: 'C' },
  { id: 'ws-c4', name: 'C-04', x: 350, y: 250, width: 80, height: 60, zone: 'C' },
  // Zone D - Undergraduate & Staff
  { id: 'ws-d1', name: 'D-01', x: 50, y: 350, width: 80, height: 60, zone: 'D', personId: '7' },
  { id: 'ws-d2', name: 'D-02', x: 150, y: 350, width: 80, height: 60, zone: 'D', personId: '8' },
  { id: 'ws-d3', name: 'D-03', x: 250, y: 350, width: 80, height: 60, zone: 'D' },
]

// ============ Resources ============
export const mockResources: Resource[] = [
  {
    id: 'r1',
    name: 'GPU 计算集群',
    type: 'compute',
    description: '8x NVIDIA A100 GPU 集群，支持大规模深度学习训练',
    url: 'https://cluster.idrl.edu.cn',
    status: 'available',
    specs: {
      'GPU': '8x NVIDIA A100 80GB',
      'CPU': 'AMD EPYC 7742 64核',
      'Memory': '512GB DDR4',
      'Storage': '10TB NVMe SSD',
    },
    accessLevel: 'member',
  },
  {
    id: 'r2',
    name: 'CPU 计算节点',
    type: 'compute',
    description: '高性能 CPU 计算节点，适合数据预处理和仿真任务',
    url: 'https://cluster.idrl.edu.cn',
    status: 'available',
    specs: {
      'CPU': '2x Intel Xeon Gold 6348',
      'Memory': '256GB DDR4',
      'Storage': '4TB NVMe SSD',
    },
    accessLevel: 'member',
  },
  {
    id: 'r3',
    name: '实验室网盘',
    type: 'storage',
    description: '团队协作文件存储，支持版本管理和共享',
    url: 'https://drive.idrl.edu.cn',
    status: 'available',
    specs: {
      'Total Capacity': '50TB',
      'Protocol': 'WebDAV / SMB / NFS',
    },
    accessLevel: 'member',
  },
  {
    id: 'r4',
    name: 'GitLab 代码仓库',
    type: 'code',
    description: '私有代码托管平台，支持 CI/CD 流水线',
    url: 'https://git.idrl.edu.cn',
    status: 'available',
    specs: {
      'Version': 'GitLab EE 16.x',
      'Features': 'CI/CD, Container Registry, Wiki',
    },
    accessLevel: 'member',
  },
  {
    id: 'r5',
    name: '知识库文档',
    type: 'docs',
    description: '实验室内部文档、教程和最佳实践指南',
    url: 'https://docs.idrl.edu.cn',
    status: 'available',
    accessLevel: 'public',
  },
  {
    id: 'r6',
    name: 'Jupyter Hub',
    type: 'compute',
    description: '在线 Jupyter 环境，预装常用 ML 框架',
    url: 'https://jupyter.idrl.edu.cn',
    status: 'maintenance',
    specs: {
      'Kernels': 'Python 3.10, R 4.2',
      'Frameworks': 'PyTorch 2.0, TensorFlow 2.12',
    },
    accessLevel: 'member',
  },
]

// ============ News & Updates ============
export const mockNews: NewsItem[] = [
  {
    id: 'n1',
    type: 'paper',
    title: '实验室论文被 NeurIPS 2024 接收',
    content: `恭喜李明博士后的论文 **"Hierarchical Reinforcement Learning with Adaptive Subgoal Discovery"** 被 NeurIPS 2024 接收为 **Spotlight** 论文！

## 论文摘要

本文提出了一种基于自适应子目标发现的分层强化学习框架。该方法能够在复杂任务中自动发现有用的子目标，并在此基础上进行分层策略学习。

| 方法 | AntMaze | Kitchen | FrankaKitchen |
|------|---------|---------|---------------|
| HIHG | 62.3 | 78.1 | 71.5 |
| HAC | 45.7 | 65.3 | 58.2 |
| **Ours** | **81.5** | **89.4** | **83.7** |

### 主要贡献

1. **自适应子目标发现机制**：基于内在奖励信号自动识别有价值的中间状态
2. **分层策略优化**：上层策略生成子目标，下层策略执行原语动作
3. **跨任务泛化**：在多个基准环境中验证了方法的通用性

> "这项工作为分层强化学习中的子目标发现问题提供了一个优雅的解决方案。" — 匿名审稿人

论文代码已开源：\`github.com/idrl/hierarchical-rl\``,
    summary: 'NeurIPS 2024 Spotlight 论文',
    author: '李明',
    date: '2024-09-15',
    tags: ['论文', 'NeurIPS', '强化学习'],
    pinned: true,
  },
  {
    id: 'n2',
    type: 'notice',
    title: '实验室搬迁通知',
    content: `实验室将于下月初搬迁至 **新科研楼 A 座 5 层**，请各位同学提前整理个人物品。

## 搬迁安排

| 时间段 | 内容 | 负责人 |
|--------|------|--------|
| 9月28日-30日 | 个人物品整理打包 | 全体成员 |
| 10月1日-2日 | 设备迁移与安装 | 技术组 |
| 10月3日 | 网络调试与环境恢复 | 网络管理员 |
| 10月4日起 | 新实验室正式启用 | — |

### 注意事项

- 个人物品请使用统一发放的纸箱打包，并在箱外标注 **姓名** 和 **新工位号**
- 精密仪器请勿自行搬运，由专人负责
- 搬迁期间实验室 **暂停开放**，请提前保存好实验数据

### 新实验室布局

新实验室共 **5 个区域**：

1. A 区 — 教授/博后办公室
2. B 区 — 博士生工作区
3. C 区 — 硕士生工作区
4. D 区 — 本科生/行政区
5. E 区 — **新增** 会议/讨论区

如有疑问请联系行政吴芳。`,
    summary: '10月初搬迁至新科研楼',
    date: '2024-09-10',
    tags: ['通知', '搬迁'],
    pinned: true,
  },
  {
    id: 'n3',
    type: 'event',
    title: '学术沙龙：大语言模型前沿进展',
    content: `本周五下午 3 点，我们邀请了来自某知名企业的研究员为大家分享大语言模型的最新研究进展，欢迎大家踊跃参加！

## 活动信息

- **时间**：9月15日（周五）15:00-17:00
- **地点**：新科研楼 A 座 501 报告厅
- **主讲人**：张博士（某科技集团 AI Lab）

## 分享大纲

### 1. LLM 基础架构演进 (15:00-15:40)

从 Transformer 到 Mixture-of-Experts，回顾大模型架构的关键创新。

\`\`\`
参数规模趋势：
GPT-3  → 175B (2020)
PaLM   → 540B (2022)
GPT-4  → ~1.8T MoE (2023)
\`\`\`

### 2. RLHF 与对齐技术 (15:40-16:20)

### 3. 多模态融合 (16:20-17:00)

## 报名方式

无需提前报名，直接到场参加即可。座位有限，**建议提前 10 分钟到场**。`,
    summary: '周五下午3点，新科研楼报告厅',
    date: '2024-09-12',
    tags: ['活动', '学术沙龙', 'LLM'],
  },
  {
    id: 'n4',
    type: 'achievement',
    title: '王小红获得国家奖学金',
    content: `恭喜博士生 **王小红** 凭借在自然语言处理领域的出色研究成果，获得 **2024 年度国家奖学金**！

## 获奖成果

王小红同学在攻读博士学位期间，主要围绕 **低资源场景下的文本理解与生成** 展开研究，代表性成果包括：

| 论文 | 会议/期刊 | 时间 |
|------|----------|------|
| Cross-Lingual Transfer with Minimal Supervision | ACL 2024 | 2024.08 |
| Efficient Pre-training for Low-Resource NLP | EMNLP 2023 | 2023.12 |
| A Unified Framework for Text Classification | AAAI 2023 | 2023.02 |

### 导师寄语

> 小红同学在研究中展现了扎实的理论功底和出色的创新能力。她在低资源 NLP 方面的系列工作，为该领域提供了新的思路和方法。希望她继续努力，取得更大的成就！——张教授`,
    summary: '2024 年度国家奖学金',
    author: '王小红',
    date: '2024-09-08',
    tags: ['荣誉', '奖学金'],
  },
  {
    id: 'n5',
    type: 'paper',
    title: 'CVPR 2024 论文发表',
    content: `实验室在计算机视觉顶会 **CVPR 2024** 发表论文 2 篇，研究方向涵盖视觉问答和图像生成。

## 论文一：Visual Question Answering with Knowledge-Grounded Reasoning

**作者**：李明、张教授

提出了一种将外部知识图谱与视觉特征深度融合的视觉问答框架，在 OK-VQA 和 A-OKVQA 基准上取得了 **SOTA** 表现。

| 模型 | OK-VQA | A-OKVQA |
|------|--------|---------|
| BLIP-2 | 52.1 | 55.8 |
| REVIVE | 55.4 | 58.2 |
| **Ours** | **59.7** | **62.3** |

## 论文二：Conditional Image Generation with Diffusion Models

**作者**：陈思、李明、张教授

基于扩散模型的条件图像生成方法，通过引入结构化的 latent space 约束，显著提升了生成图像的质量与可控性。`,
    summary: 'CVPR 2024 发表 2 篇论文',
    date: '2024-06-20',
    tags: ['论文', 'CVPR', '计算机视觉'],
  },
  {
    id: 'n6',
    type: 'event',
    title: '实验室年度团建活动',
    content: `一年一度的实验室团建活动将于国庆期间举行，今年我们将前往 **黄山** 进行为期两天的户外活动。

## 行程安排

### Day 1 — 10月5日（周六）

| 时间 | 活动 |
|------|------|
| 07:00 | 校门口集合出发 |
| 10:00 | 抵达黄山风景区 |
| 10:30-17:00 | 登山游览（前山路线） |
| 18:00 | 入住酒店，团队晚餐 |

### Day 2 — 10月6日（周日）

| 时间 | 活动 |
|------|------|
| 06:00 | 观日出（可选） |
| 08:00-12:00 | 后山路线游览 |
| 13:00 | 午餐后返程 |

## 费用说明

实验室统一承担以下费用：

- 往返交通
- 景区门票及索道
- 酒店住宿（标间）
- 团队晚餐

**个人需准备**：登山鞋、防晒用品、个人药品、换洗衣物。

> 详情请查看钉钉群公告，报名截止日期为 **9月25日**。`,
    summary: '国庆期间黄山团建',
    date: '2024-09-05',
    tags: ['活动', '团建'],
  },
]

// ============ Auth Mock ============
export const mockUser = {
  id: 'u1',
  username: 'admin',
  email: 'admin@idrl.edu.cn',
  name: '管理员',
  role: 'admin' as const,
}

// Helper to get person by workstation
export function getPersonByWorkstation(workstationId: string): Person | undefined {
  const workstation = mockWorkstations.find(ws => ws.id === workstationId)
  if (!workstation?.personId) return undefined
  return mockPersonnel.find(p => p.id === workstation.personId)
}

// Helper to get workstation by person
export function getWorkstationByPerson(personId: string): Workstation | undefined {
  return mockWorkstations.find(ws => ws.personId === personId)
}

// Statistics helpers
export function getPersonnelStats() {
  const total = mockPersonnel.length
  const online = mockPersonnel.filter(p => p.status === 'online').length
  const busy = mockPersonnel.filter(p => p.status === 'busy').length
  const offline = mockPersonnel.filter(p => p.status === 'offline').length
  const leave = mockPersonnel.filter(p => p.status === 'leave').length
  
  return { total, online, busy, offline, leave }
}

export function getWorkstationStats() {
  const total = mockWorkstations.length
  const occupied = mockWorkstations.filter(ws => ws.personId).length
  const available = total - occupied

  return { total, occupied, available }
}

// ============ Floor Layout Data ============

function generateWorkstations(zoneId: string, floorId: string, prefix: string, rows: number, cols: number, occupiedIds: string[] = []): NewWorkstation[] {
  const result: NewWorkstation[] = []
  const occupiedCopy = [...occupiedIds]
  let idx = 1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const personId = occupiedCopy.shift()
      result.push({
        id: `ws-${zoneId}-${idx}`,
        name: `${prefix}-${String(idx).padStart(2, '0')}`,
        zoneId,
        floorId,
        row: r,
        col: c,
        personId,
        status: personId ? 'occupied' : 'empty',
      })
      idx++
    }
  }
  return result
}

export const mockFloors: FloorType[] = [
  {
    id: 'floor-9',
    name: '9层',
    order: 0,
    zones: [
      {
        id: 'zone-9a',
        name: '教授/博士后区',
        floorId: 'floor-9',
        color: 'oklch(0.65 0.18 260)',
        order: 0,
        mode: 'grid',
        rows: 2,
        cols: 3,
        maxRows: 2,
        maxCols: 3,
        workstations: generateWorkstations('zone-9a', 'floor-9', 'A', 2, 3, ['1', '2']),
      },
      {
        id: 'zone-9b',
        name: '博士生区',
        floorId: 'floor-9',
        color: 'oklch(0.65 0.18 145)',
        order: 1,
        mode: 'grid',
        rows: 3,
        cols: 6,
        maxRows: 3,
        maxCols: 6,
        workstations: generateWorkstations('zone-9b', 'floor-9', 'B', 3, 6, ['3', '4']),
      },
      {
        id: 'zone-9c',
        name: '硕士生区',
        floorId: 'floor-9',
        color: 'oklch(0.70 0.15 55)',
        order: 2,
        mode: 'grid',
        rows: 3,
        cols: 6,
        maxRows: 3,
        maxCols: 6,
        workstations: generateWorkstations('zone-9c', 'floor-9', 'C', 3, 6, ['5', '6']),
      },
    ],
  },
  {
    id: 'floor-10',
    name: '10层',
    order: 1,
    zones: [
      {
        id: 'zone-10a',
        name: '本科生/行政区',
        floorId: 'floor-10',
        color: 'oklch(0.65 0.15 300)',
        order: 0,
        mode: 'grid',
        rows: 2,
        cols: 4,
        maxRows: 2,
        maxCols: 4,
        workstations: generateWorkstations('zone-10a', 'floor-10', 'D', 2, 4, ['7', '8']),
      },
      {
        id: 'zone-10b',
        name: '会议/讨论区',
        floorId: 'floor-10',
        color: 'oklch(0.60 0.12 30)',
        order: 1,
        mode: 'grid',
        rows: 2,
        cols: 3,
        maxRows: 2,
        maxCols: 3,
        workstations: generateWorkstations('zone-10b', 'floor-10', 'E', 2, 3),
      },
      {
        id: 'zone-10c',
        name: '自由讨论区',
        floorId: 'floor-10',
        color: 'oklch(0.62 0.13 200)',
        order: 2,
        mode: 'free',
        rows: 0,
        cols: 0,
        maxRows: 4,
        maxCols: 6,
        workstations: [
          { id: 'ws-zone-10c-1', name: '自-01', zoneId: 'zone-10c', floorId: 'floor-10',
            row: 0, col: 1, status: 'empty' },
          { id: 'ws-zone-10c-2', name: '自-02', zoneId: 'zone-10c', floorId: 'floor-10',
            row: 0, col: 4, status: 'empty' },
          { id: 'ws-zone-10c-3', name: '自-03', zoneId: 'zone-10c', floorId: 'floor-10',
            row: 2, col: 0, status: 'empty' },
          { id: 'ws-zone-10c-4', name: '自-04', zoneId: 'zone-10c', floorId: 'floor-10',
            row: 2, col: 5, status: 'empty' },
        ],
      },
    ],
  },
]

