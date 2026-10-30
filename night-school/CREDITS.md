# 素材の出典

外部の素材はすべて **CC0（パブリックドメイン）** です。著作権表示は不要ですが、感謝を込めて出典を記します。

## テクスチャ（public/textures）

[Poly Haven](https://polyhaven.com/textures) の CC0 テクスチャを、色合いの調整・縮小・WebP 化して使っています。
法線マップ（`*_n.webp`）と粗さマップ（`*_r.webp`）は元の素材名、色（`*_d.webp`）はゲーム内の材質名です。

| ゲーム内の材質 | 元の素材 |
|---|---|
| wall（校舎の壁・腰壁つき） | plastered_wall_04 |
| floor（廊下） | linoleum_brown |
| woodfloor（教室・体育館） | wood_floor |
| ceiling（天井） | ceiling_interior |
| tile（トイレの壁） | rounded_square_tiled_wall |
| tilefloor（トイレの床） | square_tiles_02 |
| wood（机・扉） | oak_veneer_01 |
| stall・stallDoor・locker・doorMetal・metalGray（塗装した鉄） | rusty_painted_metal |
| concrete | concrete_wall_008 |
| asphalt（道路） | asphalt_02 |
| grass（中庭） | sparse_grass |
| plaster（花子さんの家の壁） | clay_plaster |
| homeWall（自分の家の壁） | plastered_wall_02 |
| storeWall・counter（コンビニ） | plastered_wall_04 |
| tatami（畳） | tatami_mat |
| roof（屋根） | grey_roof_tiles |
| fence（ブロック塀） | concrete_block_wall |
| bamboo（竹刀） | bamboo_wall_02 |
| leather（防具袋・靴） | fabric_leather_02 |
| hydrant（消火栓） | rusty_painted_metal |
| labTop（理科室の机の天板） | concrete_wall_008 |
| statueStone（二宮金次郎像） | rock_surface |
| moss（像の苔） | mossy_rock |
| clothWhite・clothRed・clothDark・clothGray（服） | cotton_jersey |
| fleece（ソファ・座布団） | knitted_fleece |
| bark（中庭の木の幹） | japanese_camphor_bark |

## 3D モデル（public/models）

[Poly Haven](https://polyhaven.com/models) の CC0 モデルを、gltf-transform で軽量化（ポリゴン削減・テクスチャ縮小）して使っています。

SchoolDesk_01, SchoolChair_01, metal_office_desk, old_bed_frame, wall_clock, steel_frame_shelves_01,
drawer_cabinet, metal_trash_can, wheelchair_01, medical_box, cardboard_box_01, plastic_broom, dustpan,
chemistry_set, bunsen_burner, vintage_microscope, binder_notebook, office_notepads, stationery_supplies,
desk_lamp_arm_01, bleach_bottle, medical_tape, television_02, tea_set_01, vintage_cabinet_01, vintage_microwave,
russian_food_cans_01, long_life_food, plastic_crate_01, utility_box_01, steel_frame_shelves_02, security_camera_01,
water_manhole_cover, alarm_clock_01, vintage_grandfather_clock_01, painted_wooden_bench, football

## 人の体（public/models/human.gltf.json）

[MakeHuman](http://www.makehumancommunity.org/) の基本メッシュ（hm08）と標準の骨・ウェイト（default.mhskel / default_weights.mhw）を、
ゲーム用に変換して使っています（どちらも CC0、[makehumancommunity/makehuman](https://github.com/makehumancommunity/makehuman)）。
骨は 163 本を 25 本にまとめ、体つき（子ども・大人・やせ細った化け物）はゲームの中で骨ごとに伸び縮みさせて作っています。
肌の絵（human_d・human_n）は、この体の UV に合わせてコードで焼いた自作の絵です。

花子さん・影の子ども・母親・店員・二宮金次郎像はこの体で作り、服・石の質感に上の写真テクスチャを使っています。
人体模型、木の葉、コンビニの商品の包装は、コードで組んだ形・描いた絵です。
